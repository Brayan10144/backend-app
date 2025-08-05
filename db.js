// db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'gondola.proxy.rlwy.net',
  port: 36026,
  user: 'root',
  password: 'tFkBNvQuXKSmFAlkKzwdlBDDDGgwPUgh',
  database: 'railway',
});

connection.connect(err => {
  if (err) {
    console.error('Error de conexión:', err);
    return;
  }
  console.log('Conectado a Railway MySQL');
});

module.exports = connection;
