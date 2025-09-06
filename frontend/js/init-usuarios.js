// Crear usuario administrador inicial si no existen usuarios
(function() {
  let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];

  if (usuarios.length === 0) {
    usuarios.push({
      id: 1,
      nombre: "Administrador",
      usuario: "admin",
      password: "admin123",
      rol: "administrador",
      primerInicio: true
    });

    localStorage.setItem('usuarios', JSON.stringify(usuarios));
    console.log("Usuario admin creado automáticamente.");
  }
})();

