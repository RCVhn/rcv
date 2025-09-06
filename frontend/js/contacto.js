// frontend/js/contacto.js
(function(){
  const C = window.PUBLIC_CONTENT || { taller:{}, redes:{} };
  const t = C.taller || {}; const r=C.redes||{};
  function id(x){return document.getElementById(x);}
  id('tNombre').textContent = t.nombre||'';
  id('tTel').textContent = t.telefono||'';
  id('tEmail').textContent = t.email||'';
  id('tDir').textContent = t.direccion||'';
  id('tHorario').textContent = t.horario||'';

  const wa = r.whatsappCatalogo || t.whatsapp || '#';
  const maps = r.mapsEmbed || '';
  const fb = r.facebookPageUrl || '';

  if (wa && wa!=='#') { id('btnWhats').href = wa; id('btnCatalogo').href = r.whatsappCatalogo || wa; }
  id('btnMail').href = t.email ? ('mailto:'+t.email) : '#';

  if(maps){ id('mapWrap').innerHTML = '<iframe src="'+maps+'" width="100%" height="100%" style="border:0" loading="lazy"></iframe>'; }
  if(fb){
    id('fbWrap').innerHTML = '<iframe src="https://www.facebook.com/plugins/page.php?href='+encodeURIComponent(fb)+'&tabs=timeline&width=500&height=300&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=true" width="100%" height="320" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>';
  }else{
    id('fbWrap').innerHTML = '<p class="muted">Configura tu página de Facebook en public-content.js</p>';
  }

  function buildMsg(){
    const nombre = id('nombre').value.trim();
    const tel = id('telefono').value.trim();
    const email = id('email').value.trim();
    const msg = id('mensaje').value.trim();
    return `Hola, soy ${nombre}. Tel: ${tel}. Email: ${email}. ${msg}`;
  }
  id('enviarWhats').addEventListener('click', (e)=>{
    e.preventDefault();
    const base = (t.whatsapp && t.whatsapp.startsWith('https://wa.me/')) ? t.whatsapp : (r.whatsappCatalogo || '');
    const url = (base||'https://wa.me/50400000000') + '?text=' + encodeURIComponent(buildMsg());
    window.open(url, '_blank');
  });
  id('enviarEmail').addEventListener('click', (e)=>{
    e.preventDefault();
    const to = t.email || 'info@ejemplo.com';
    const sub = encodeURIComponent('Consulta desde el sitio');
    const body = encodeURIComponent(buildMsg());
    window.location.href = `mailto:${to}?subject=${sub}&body=${body}`;
  });
})();

