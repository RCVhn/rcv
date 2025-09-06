"use strict";

const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { requirePermission } = require('../middleware/requirePermission');

const IS_PG = (process.env.DB_ENGINE || '').toLowerCase().includes('postg');

// Health
router.get('/_alive', (_req, res) => res.json({ ok: true, mod: 'facturacion' }));

function promisify(db) {
  const getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => e ? rej(e) : res(r)));
  const allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => e ? rej(e) : res(r)));
  const runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function (e) { e ? rej(e) : res(this); }));
  return { getAsync, allAsync, runAsync };
}

const money = n => Math.round((Number(n)||0)*100)/100;
const round2 = n => Math.round((Number(n)||0)*100)/100;
const computeFinalFromBase = (precio_base, pct) => round2((Number(precio_base)||0) * (1 + (Number(pct)||0)/100));

async function safeGetProducto(db, id) {
  const { getAsync } = promisify(db);
  try { return await getAsync(`SELECT id, nombre, tipo, tarifa_isv, precio FROM productos WHERE id=?`, [id]); }
  catch (e) { if (/no such table/i.test(e.message||'')) return null; throw e; }
}
async function safeGetCatalogo(db, id) {
  const { getAsync } = promisify(db);
  try { return await getAsync(`SELECT id, nombre, tipo, precio_base, impuesto_pct FROM catalogo WHERE id=?`, [id]); }
  catch (e) { if (/no such table/i.test(e.message||'')) return null; throw e; }
}

function parseItemSource(raw) {
  let prefer = null; let id = raw.item_id;
  if (typeof raw.item_ref === 'string') {
    const s = raw.item_ref.toLowerCase();
    if (s.startsWith('prod:')) { prefer = 'prod'; id = Number(s.split(':')[1]); }
    if (s.startsWith('cat:'))  { prefer = 'cat';  id = Number(s.split(':')[1]); }
  }
  const src = (raw.source || raw.origen || '').toString().toLowerCase();
  if (['prod','producto','productos'].includes(src)) prefer = 'prod';
  if (['cat','catalogo'].includes(src)) prefer = 'cat';
  return { prefer, id: Number(id || 0) || null };
}

function normalizeItem(raw, opts = {}) {
  const { fallbackTipo = 'producto', defaultTarifa = 15 } = opts;
  const cantidad = Number(raw.cantidad || 0);
  const precio_unitario = Number(raw.precio_unitario || 0);

  let descuento_monto = 0;
  if (raw.descuento_pct !== undefined && raw.descuento_pct !== null && raw.descuento_pct !== '') {
    const pct = Math.max(0, Math.min(100, Number(raw.descuento_pct)));
    descuento_monto = round2((cantidad * precio_unitario) * (pct / 100));
  } else if (raw.descuento !== undefined && raw.descuento !== null && raw.descuento !== '') {
    descuento_monto = Math.max(0, Number(raw.descuento));
  }

  let tarifa_isv = null;
  if (raw.impuesto_pct !== undefined && raw.impuesto_pct !== null && raw.impuesto_pct !== '') tarifa_isv = Number(raw.impuesto_pct);
  else if (raw.tarifa_isv !== undefined && raw.tarifa_isv !== null && raw.tarifa_isv !== '') tarifa_isv = Number(raw.tarifa_isv);
  if (tarifa_isv === null || Number.isNaN(tarifa_isv)) tarifa_isv = defaultTarifa;

  const tipo = (raw.tipo || fallbackTipo);
  const descripcion = raw.descripcion || null;

  return { producto_id: raw.producto_id ?? null, tipo, descripcion, cantidad, precio_unitario, descuento: descuento_monto, tarifa_isv };
}

function computeLine({ cantidad, precio_unitario, descuento = 0, tarifa_isv = 15 }) {
  const qty = Number(cantidad) || 0;
  const pu  = Number(precio_unitario) || 0;
  const desc= Number(descuento) || 0;
  const base = Math.max(qty * pu - desc, 0);
  let imp = 0;
  if (Number(tarifa_isv) === 15) imp = base * 0.15;
  else if (Number(tarifa_isv) === 18) imp = base * 0.18;
  else imp = 0;
  return { base_imponible: money(base), impuesto: money(imp), total_linea: money(base + imp) };
}

function sumDocument(items){
  let grav=0, exen=0, i15=0, i18=0, desc=0;
  for (const it of items){
    desc += Number(it.descuento)||0;
    if(Number(it.tarifa_isv)===0) exen += it.base_imponible;
    else { grav += it.base_imponible; if(Number(it.tarifa_isv)===15) i15 += it.impuesto; if(Number(it.tarifa_isv)===18) i18 += it.impuesto; }
  }
  const total = grav + exen + i15 + i18;
  return { subtotal_gravado: money(grav), subtotal_exento: money(exen), isv_15: money(i15), isv_18: money(i18), descuento_total: money(desc), total: money(total) };
}

async function withTx(runAsync, fn){
  await runAsync('BEGIN');
  try { const r = await fn(); await runAsync('COMMIT'); return r; }
  catch(e){ try{ await runAsync('ROLLBACK'); }catch{} throw e; }
}

/* ================= CAI ================= */

router.get('/cai', requirePermission('facturacion.view'), async (_req, res) => {
  try {
    const db = getDB(); const { allAsync } = promisify(db);
    const rows = await allAsync(`SELECT * FROM cai_autorizaciones ORDER BY estado ASC, fecha_limite ASC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ============ Emitir documento ============ */
router.post('/documentos', requirePermission('facturacion.emitir'), async (req, res) => {
  try {
    const db = getDB(); const { getAsync, runAsync, allAsync } = promisify(db);
    const {
      tipo='FACTURA', cai_id, fecha_emision, lugar_emision='San Pedro Sula', moneda='HNL',
      emisor={}, cliente={}, items=[], referencia=null, total_letras=null, destino=null
    } = req.body || {};

    if (emisor && typeof emisor.nombre === 'string') emisor.nombre = emisor.nombre.toLocaleUpperCase('es-HN');

    if(!cai_id || !fecha_emision || !emisor?.rtn || !emisor?.nombre)
      return res.status(400).json({ error: 'FALTAN_CAMPOS_OBLIGATORIOS' });

    const cai = await getAsync(`SELECT * FROM cai_autorizaciones WHERE id=?`, [cai_id]);
    if(!cai) return res.status(400).json({ error: 'CAI_INEXISTENTE' });
    if(cai.estado !== 'vigente') return res.status(400).json({ error: 'CAI_NO_VIGENTE' });

    const hoyISO = (new Date()).toISOString().slice(0,10);
    if(new Date(fecha_emision) > new Date(cai.fecha_limite)) return res.status(400).json({ error: 'FECHA_SUPERA_LIMITE' });
    if(new Date(hoyISO) > new Date(cai.fecha_limite)) return res.status(400).json({ error: 'CAI_VENCIDO' });

    if(!Array.isArray(items) || items.length===0) return res.status(400).json({ error: 'SIN_ITEMS' });

    // movimientos inventario (tabla mínima)
    if (IS_PG) {
      await runAsync(`
        CREATE TABLE IF NOT EXISTS inventario_movimientos (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          producto_id BIGINT NOT NULL,
          tipo TEXT NOT NULL,
          cantidad NUMERIC NOT NULL,
          motivo TEXT,
          referencia TEXT,
          documento_id BIGINT,
          fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await runAsync(`
        CREATE TABLE IF NOT EXISTS inventario_movimientos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          producto_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          cantidad REAL NOT NULL,
          motivo TEXT,
          referencia TEXT,
          documento_id INTEGER,
          fecha TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )
      `);
    }

    const calc = [];
    for (const raw0 of items) {
      const raw = { ...raw0 };
      const { prefer, id } = parseItemSource(raw);

      let prod = null, cat = null;
      if (id) {
        if (prefer === 'prod') { prod = await safeGetProducto(db, id); if (!prod) cat = await safeGetCatalogo(db, id); }
        else if (prefer === 'cat') { cat = await safeGetCatalogo(db, id); if (!cat) prod = await safeGetProducto(db, id); }
        else { prod = await safeGetProducto(db, id); if (!prod) cat = await safeGetCatalogo(db, id); }
      }

      if (prod) {
        if (!raw.tipo) raw.tipo = (prod.tipo || 'repuesto');
        if (!raw.descripcion) raw.descripcion = prod.nombre;
        if (raw.impuesto_pct == null && raw.tarifa_isv == null && prod.tarifa_isv != null) raw.tarifa_isv = prod.tarifa_isv;
        if (raw.precio_unitario == null && prod.precio != null) raw.precio_unitario = prod.precio;
        raw.producto_id = raw.producto_id ?? prod.id;
      } else if (cat) {
        if (!raw.tipo) raw.tipo = (cat.tipo || 'servicio');
        if (!raw.descripcion) raw.descripcion = cat.nombre;
        if (raw.impuesto_pct == null && raw.tarifa_isv == null && cat.impuesto_pct != null) raw.tarifa_isv = cat.impuesto_pct;
        if (raw.precio_unitario == null) {
          const base = cat.precio_base != null ? Number(cat.precio_base) : 0;
          const pct  = cat.impuesto_pct != null ? Number(cat.impuesto_pct) : 15;
          raw.precio_unitario = computeFinalFromBase(base, pct);
        }
      }

      const norm = normalizeItem(raw, { defaultTarifa: 15 });
      const line = { ...norm, ...computeLine(norm) };
      calc.push(line);
    }

    const sum  = sumDocument(calc);

    const result = await withTx(runAsync, async ()=>{
      const used = await getAsync(`SELECT MAX(secuencia) AS maxsec FROM documentos WHERE cai_id=?`, [cai.id]);
      const start = Number(cai.rango_inicio), end = Number(cai.rango_fin);
      const curr = used?.maxsec ? Number(used.maxsec) : (start - 1);
      const next = curr + 1;
      if (next > end) throw new Error('RANGO_AGOTADO');

      const correlativo = `${String(cai.establecimiento).padStart(3,'0')}-${String(cai.punto_emision).padStart(3,'0')}-${String(cai.tipo_doc).padStart(2,'0')}-${String(next).padStart(8,'0')}`;

      const ins = await runAsync(`
        INSERT INTO documentos
        (tipo,cai_id,secuencia,correlativo,fecha_emision,lugar_emision,moneda,
         emisor_rtn,emisor_nombre,emisor_domicilio,
         cliente_rtn,cliente_nombre,
         subtotal_gravado,subtotal_exento,isv_15,isv_18,descuento_total,total,total_letras,destino,estado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
        tipo,cai.id,next,correlativo,fecha_emision,lugar_emision,moneda,
        emisor.rtn,emisor.nombre,emisor.domicilio||null,
        cliente.rtn||null,cliente.nombre||null,
        sum.subtotal_gravado,sum.subtotal_exento,sum.isv_15,sum.isv_18,sum.descuento_total,sum.total,total_letras,destino,'emitido'
      ]);

      const docId = ins.lastID ?? (await getAsync(`SELECT id FROM documentos WHERE correlativo=?`,[correlativo])).id;

      for(const it of calc){
        await runAsync(`
          INSERT INTO documento_items
          (documento_id,descripcion,cantidad,precio_unitario,descuento,tarifa_isv,base_imponible,impuesto,total_linea,producto_id,tipo)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `,[docId,it.descripcion,it.cantidad,it.precio_unitario,it.descuento||0,it.tarifa_isv,it.base_imponible,it.impuesto,it.total_linea,it.producto_id||null,it.tipo]);

        if (it.tipo === 'repuesto' && it.producto_id) {
          await runAsync(`UPDATE productos SET stock = stock - ? WHERE id=?`, [Number(it.cantidad)||0, it.producto_id]);
          await runAsync(`
            INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, motivo, referencia, documento_id, fecha)
            VALUES (?,?,?,?,?,?,?)
          `,[it.producto_id,'salida',Number(it.cantidad)||0,'Venta facturada',correlativo,docId,fecha_emision]);
        }
      }

      if(next >= Number(cai.rango_fin)){
        await runAsync(`UPDATE cai_autorizaciones SET estado='agotado' WHERE id=?`,[cai.id]);
      }

      const header = await getAsync(`SELECT * FROM documentos WHERE id=?`,[docId]);
      const lines  = await allAsync(`SELECT * FROM documento_items WHERE documento_id=?`,[docId]);
      const refs   = await allAsync(`SELECT * FROM documentos_referencias WHERE doc_id=?`,[docId]);
      return { header, items: lines, referencias: refs };
    });

    res.status(201).json(result);
  } catch (e) {
    const known = ['RANGO_AGOTADO','CAI_VENCIDO','FECHA_SUPERA_LIMITE','REFERENCIA_INCOMPLETA','STOCK_INSUFICIENTE'];
    if(known.includes(e.message)) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/* ============ Desde cotización ============ */
router.post('/documentos/desde-cotizacion/:id(\\d+)', requirePermission('facturacion.emitir'), async (req, res) => {
  const db = getDB(); 
  const { getAsync, allAsync, runAsync } = promisify(db);

  try {
    const cotId = Number(req.params.id);
    const {
      cai_id, fecha_emision,
      lugar_emision='San Pedro Sula', moneda='HNL',
      emisor={}, cliente={}, total_letras=null, destino=null
    } = req.body || {};

    await runAsync(`
      CREATE TABLE IF NOT EXISTS cotizaciones_documentos (
        cotizacion_id ${IS_PG?'BIGINT UNIQUE':'INTEGER UNIQUE'},
        documento_id ${IS_PG?'BIGINT':'INTEGER'} NOT NULL
      )
    `);
    await runAsync(`
      CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id ${IS_PG?'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY':'INTEGER PRIMARY KEY AUTOINCREMENT'},
        producto_id ${IS_PG?'BIGINT':'INTEGER'} NOT NULL,
        tipo TEXT NOT NULL,
        cantidad ${IS_PG?'NUMERIC':'REAL'} NOT NULL,
        motivo TEXT,
        referencia TEXT,
        documento_id ${IS_PG?'BIGINT':'INTEGER'},
        fecha ${IS_PG?'TIMESTAMP':'TEXT'} NOT NULL DEFAULT ${IS_PG?'CURRENT_TIMESTAMP':'(CURRENT_TIMESTAMP)'}
      )
    `);

    if (!cai_id || !fecha_emision || !emisor?.rtn || !emisor?.nombre) return res.status(400).json({ error: 'FALTAN_CAMPOS_OBLIGATORIOS' });

    const cot = await getAsync(`SELECT * FROM cotizaciones WHERE id=?`, [cotId]);
    if (!cot) return res.status(404).json({ error: 'COTIZACION_NO_ENCONTRADA' });

    const vinc = await getAsync(`SELECT documento_id FROM cotizaciones_documentos WHERE cotizacion_id=?`, [cotId]);
    if (vinc) return res.status(400).json({ error: 'COTIZACION_YA_FACTURADA', documento_id: vinc.documento_id });

    const itemsCot = await allAsync(`
      SELECT id, item_id, tipo, descripcion, cantidad, precio_unitario, descuento_pct, impuesto_pct
      FROM cotizacion_items
      WHERE cotizacion_id=?
      ORDER BY id ASC
    `,[cotId]);
    if (!itemsCot.length) return res.status(400).json({ error: 'COTIZACION_SIN_ITEMS' });

    const cai = await getAsync(`SELECT * FROM cai_autorizaciones WHERE id=?`, [cai_id]);
    if(!cai) return res.status(400).json({ error: 'CAI_INEXISTENTE' });
    if(cai.estado !== 'vigente') return res.status(400).json({ error: 'CAI_NO_VIGENTE' });
    const hoyISO = (new Date()).toISOString().slice(0,10);
    if(new Date(fecha_emision) > new Date(cai.fecha_limite)) return res.status(400).json({ error: 'FECHA_SUPERA_LIMITE' });
    if(new Date(hoyISO) > new Date(cai.fecha_limite)) return res.status(400).json({ error: 'CAI_VENCIDO' });

    const calc = itemsCot.map(r => {
      const cantidad = Number(r.cantidad || 0);
      const precio_unitario = Number(r.precio_unitario || 0);
      let descuento = 0;
      if (r.descuento_pct != null) {
        const pct = Math.max(0, Math.min(100, Number(r.descuento_pct)));
        descuento = round2((cantidad * precio_unitario) * (pct / 100));
      }
      const tarifa_isv = (r.impuesto_pct == null || Number.isNaN(Number(r.impuesto_pct))) ? 15 : Number(r.impuesto_pct);
      const it = {
        producto_id: r.tipo === 'repuesto' ? (r.item_id ?? null) : null,
        tipo: r.tipo || 'producto',
        descripcion: r.descripcion,
        cantidad, precio_unitario, descuento, tarifa_isv,
      };
      return { ...it, ...computeLine(it) };
    });
    const sum = sumDocument(calc);

    const result = await withTx(runAsync, async ()=>{
      const used = await getAsync(`SELECT MAX(secuencia) AS maxsec FROM documentos WHERE cai_id=?`, [cai.id]);
      const start = Number(cai.rango_inicio), end = Number(cai.rango_fin);
      const curr = used?.maxsec ? Number(used.maxsec) : (start - 1);
      const next = curr + 1;
      if (next > end) throw new Error('RANGO_AGOTADO');

      const correlativo = `${String(cai.establecimiento).padStart(3,'0')}-${String(cai.punto_emision).padStart(3,'0')}-${String(cai.tipo_doc).padStart(2,'0')}-${String(next).padStart(8,'0')}`;

      const emNombre = (emisor?.nombre && typeof emisor.nombre === 'string')
        ? emisor.nombre.toLocaleUpperCase('es-HN') : emisor?.nombre;

      const ins = await runAsync(`
        INSERT INTO documentos
        (tipo,cai_id,secuencia,correlativo,fecha_emision,lugar_emision,moneda,
         emisor_rtn,emisor_nombre,emisor_domicilio,
         cliente_rtn,cliente_nombre,
         subtotal_gravado,subtotal_exento,isv_15,isv_18,descuento_total,total,total_letras,destino,estado)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,[
        'FACTURA',cai.id,next,correlativo,fecha_emision,lugar_emision,moneda,
        emisor.rtn,emNombre,emisor.domicilio||null,
        cliente.rtn||null,cliente.nombre||null,
        sum.subtotal_gravado,sum.subtotal_exento,sum.isv_15,sum.isv_18,sum.descuento_total,sum.total,total_letras,destino,'emitido'
      ]);
      const docId = ins.lastID ?? (await getAsync(`SELECT id FROM documentos WHERE correlativo=?`,[correlativo])).id;

      for (const it of calc) {
        await runAsync(`
          INSERT INTO documento_items
          (documento_id,descripcion,cantidad,precio_unitario,descuento,tarifa_isv,base_imponible,impuesto,total_linea,producto_id,tipo)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `,[docId,it.descripcion,it.cantidad,it.precio_unitario,it.descuento||0,it.tarifa_isv,it.base_imponible,it.impuesto,it.total_linea,it.producto_id,it.tipo]);

        if (it.tipo === 'repuesto' && it.producto_id) {
          await runAsync(`UPDATE productos SET stock = stock + ? WHERE id=?`, [Number(-it.cantidad)||0, it.producto_id]); // (se descuenta en inserción; esta línea la puedes ajustar a tu flujo)
        }
      }

      await runAsync(`INSERT INTO cotizaciones_documentos (cotizacion_id, documento_id) VALUES (?,?)`, [cotId, docId]);
      await runAsync(`UPDATE cotizaciones SET estado='aprobada' WHERE id=?`, [cotId]);

      const header = await getAsync(`SELECT * FROM documentos WHERE id=?`,[docId]);
      const lines  = await allAsync(`SELECT * FROM documento_items WHERE documento_id=?`,[docId]);
      return { header, items: lines, referencias: [] };
    });

    res.status(201).json(result);
  } catch (e) {
    const known = ['RANGO_AGOTADO','CAI_VENCIDO','FECHA_SUPERA_LIMITE','COTIZACION_SIN_ITEMS','COTIZACION_YA_FACTURADA'];
    if (known.includes(e.message)) return res.status(400).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

/* =================== DOCUMENTOS =================== */

router.get('/documentos', requirePermission('facturacion.view'), async (req, res) => {
  try {
    const db = getDB(); const { allAsync } = promisify(db);
    const { q } = req.query;
    if(!q){
      const rows = await allAsync(`
        SELECT id,tipo,correlativo,fecha_emision,total,estado
        FROM documentos
        ORDER BY id DESC
        LIMIT 50
      `);
      return res.json(rows);
    }
    const rows = await allAsync(`
      SELECT id,tipo,correlativo,fecha_emision,total,estado
      FROM documentos
      WHERE correlativo LIKE ?
      ORDER BY id DESC
      LIMIT 50
    `,[`%${q}%`]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/documentos/:id(\\d+)', requirePermission('facturacion.view'), async (req, res) => {
  try {
    const db = getDB(); const { getAsync, allAsync } = promisify(db);
    const { id } = req.params;
    const h = await getAsync(`SELECT * FROM documentos WHERE id=?`, [id]);
    if(!h) return res.status(404).json({ error: 'NO_ENCONTRADO' });
    const items = await allAsync(`SELECT * FROM documento_items WHERE documento_id=?`, [id]);
    const refs  = await allAsync(`SELECT * FROM documentos_referencias WHERE doc_id=?`, [id]);
    res.json({ header: h, items, referencias: refs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/documentos/:id(\\d+)/anular', requirePermission('facturacion.emitir'), async (req, res) => {
  try {
    const db = getDB(); const { getAsync, allAsync, runAsync } = promisify(db);
    const { id } = req.params;

    await runAsync('BEGIN');
    try {
      const doc = await getAsync(`SELECT * FROM documentos WHERE id=?`, [id]);
      if(!doc){ await runAsync('ROLLBACK'); return res.status(404).json({ error: 'NO_ENCONTRADO' }); }
      if(doc.estado === 'anulado'){ await runAsync('ROLLBACK'); return res.status(400).json({ error: 'YA_ANULADO' }); }

      await runAsync(`UPDATE documentos SET estado='anulado' WHERE id=?`, [id]);

      const items = await allAsync(`
        SELECT producto_id, tipo, cantidad
        FROM documento_items
        WHERE documento_id=? AND tipo='repuesto' AND producto_id IS NOT NULL
      `,[id]);

      for (const it of items) {
        const qty = Number(it.cantidad) || 0;
        if (!qty) continue;
        await runAsync(`UPDATE productos SET stock = stock + ? WHERE id=?`, [qty, it.producto_id]);
        await runAsync(`
          INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, motivo, referencia, documento_id, fecha)
          VALUES (?,?,?,?,?,?,?)
        `,[it.producto_id, 'entrada', qty, 'Anulación de documento', doc.correlativo, doc.id, doc.fecha_emision]);
      }

      await runAsync('COMMIT');
      const h = await getAsync(`SELECT * FROM documentos WHERE id=?`, [id]);
      res.json(h);
    } catch (eTx) {
      try { await runAsync('ROLLBACK'); } catch {}
      throw eTx;
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* HTML imprimible */
router.get('/documentos/:id(\\d+)/print', requirePermission('facturacion.view'), async (req, res) => {
  try {
    const db = getDB(); 
    const g = (sql, p=[]) => new Promise((ok,ko)=>db.get(sql,p,(e,r)=>e?ko(e):ok(r)));
    const a = (sql, p=[]) => new Promise((ok,ko)=>db.all(sql,p,(e,r)=>e?ko(e):ok(r)));

    const { id } = req.params;
    const { logo = '' } = req.query;

    const h = await g(`SELECT * FROM documentos WHERE id=?`, [id]);
    if (!h) return res.status(404).send('No encontrado');

    const items = await a(`SELECT * FROM documento_items WHERE documento_id=?`, [id]);
    const cai = await g(`SELECT * FROM cai_autorizaciones WHERE id=?`, [h.cai_id]);

    const money2 = n => (Math.round((Number(n)||0)*100)/100).toFixed(2);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${h.tipo} ${h.correlativo}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root{ --ink:#0f172a; --line:#e5e7eb; --muted:#64748b; }
  @page{ size: Letter; margin: 14mm; }
  *{ box-sizing:border-box }
  body{ font-family: system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif; color:var(--ink); margin:0; }
  .wrap{ max-width: 820px; margin: 0 auto; padding: 16px; }
  .hdr{ display:flex; gap:16px; align-items:center; border-bottom:2px solid var(--line); padding-bottom:12px; flex-wrap:wrap; }
  .logo{ max-height:80px; max-width:220px; object-fit:contain }
  h1{ margin:0; font-size:22px; letter-spacing:.2px }
  .small{ color:var(--muted); font-size:13px }
  .box{ border:1px solid var(--line); border-radius:12px; padding:12px; background:#fff }
  h2{ margin:0 0 8px; font-size:14px; text-transform:uppercase; letter-spacing:.4px; color:#334155 }
  table{ width:100%; border-collapse:collapse; margin-top:12px }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  th,td{ padding:8px; border-bottom:1px solid var(--line); font-size:13px; text-align:left }
  th.right, td.right{ text-align:right }
  .grid2{ display:grid; grid-template-columns: 1.5fr 0.8fr; gap:12px; margin-top:12px }
  .totals{ margin-top:12px; margin-left:auto; width:min(100%,360px); border:1px solid var(--line); border-radius:12px; padding:10px }
  .row{ display:flex; justify-content:space-between; padding:4px 0 }
  .row.total{ border-top:1px dashed #cbd5e1; margin-top:6px; padding-top:8px; font-weight:700 }
  .tag{ display:inline-block; padding:2px 8px; border-radius:999px; background:#eef2ff; color:#3730a3; font-size:12px }
  .nowrap{ white-space: nowrap; }
  .muted{ color:#64748b }
  .print-actions{ margin-top:14px }
  @media print{ .print-actions{ display:none } body{ margin:0 } .wrap{ padding:0 } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      ${logo ? `<img src="${logo}" alt="Logo" class="logo">` : ``}
      <div class="brand">
        <h1>${h.emisor_nombre||'EMISOR'}</h1>
        <div class="small">RTN: <b>${h.emisor_rtn||''}</b>${h.emisor_domicilio ? ` · ${h.emisor_domicilio}`:''}</div>
        <div class="small">Lugar de emisión: ${h.lugar_emision||''} · Moneda: ${h.moneda||'HNL'}</div>
      </div>
    </div>

    <div class="grid2">
      <div class="box">
        <h2>${h.tipo}</h2>
        <div>Correlativo: <b>${h.correlativo}</b></div>
        <div>Fecha: <b>${h.fecha_emision}</b></div>
        <div class="nowrap">CAI: <b>${cai?.cai||''}</b></div>
        <div>Vigencia CAI: <b>${cai?.fecha_limite||''}</b></div>
        <div class="small muted">Serie ${cai?.establecimiento||''}-${cai?.punto_emision||''}-${cai?.tipo_doc||''} · Rango ${cai?.rango_inicio||''}–${cai?.rango_fin||''}</div>
        <div style="margin-top:6px"><span class="tag">${h.estado}</span></div>
      </div>
      <div class="box">
        <h2>Cliente</h2>
        <div>Nombre: <b>${h.cliente_nombre || 'Consumidor Final'}</b></div>
        ${h.cliente_rtn ? `<div>RTN: <b>${h.cliente_rtn}</b></div>`:''}
        ${h.destino ? `<div class="small muted">Destino: ${h.destino}</div>`:''}
      </div>
    </div>

    <div class="box" style="margin-top:12px">
      <h2>Detalle</h2>
      <table>
        <thead>
          <tr>
            <th>Descripción</th><th class="right">Cant.</th><th class="right">P. Unit</th><th class="right">Desc</th><th class="right">ISV%</th><th class="right">Base</th><th class="right">ISV</th><th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${ (items||[]).map(i=>`
            <tr>
              <td>${i.descripcion||''}</td>
              <td class="right">${money2(i.cantidad)}</td>
              <td class="right">${money2(i.precio_unitario)}</td>
              <td class="right">${money2(i.descuento||0)}</td>
              <td class="right">${i.tarifa_isv}%</td>
              <td class="right">${money2(i.base_imponible)}</td>
              <td class="right">${money2(i.impuesto)}</td>
              <td class="right">${money2(i.total_linea)}</td>
            </tr>
          `).join('') }
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="row"><span>Subtotal gravado</span><b>L. ${money2(h.subtotal_gravado)}</b></div>
      <div class="row"><span>Subtotal exento</span><b>L. ${money2(h.subtotal_exento)}</b></div>
      <div class="row"><span>ISV 15%</span><b>L. ${money2(h.isv_15)}</b></div>
      <div class="row"><span>ISV 18%</span><b>L. ${money2(h.isv_18)}</b></div>
      <div class="row"><span>Descuento</span><b>L. ${money2(h.descuento_total)}</b></div>
      <div class="row total"><span>Total</span><b>L. ${money2(h.total)}</b></div>
    </div>

    ${h.total_letras ? `<div class="box" style="margin-top:10px"><b>Total en letras:</b> ${h.total_letras}</div>`:''}
    <div class="small muted" style="margin-top:10px">Este documento fue generado electrónicamente.</div>
    <div class="print-actions"><button onclick="window.print()">Imprimir</button></div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.send(html);
  } catch (e) { res.status(500).send('Error al generar impresión: ' + e.message); }
});

module.exports = router;
