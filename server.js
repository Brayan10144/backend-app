const express = require("express");
const cors = require("cors");                                                                                                                                                             
const db = require("./db");
const nodemailer = require("nodemailer");
require("dotenv").config();
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración del correo
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CORREO_EMISOR,
    pass: process.env.CLAVE_CORREO
  }
});


// ================== AUTENTICACIÓN ==================

app.post("/registrar", (req, res) => {
    const {
      nombre, apellido, tipo_documento, documento,
      correo, telefono1, usuario, contraseña, rol
    } = req.body;

    console.log("Registro de usuario recivido.")
    console.log("Rol: ", rol)
    console.log("Nombre: ", nombre)
    console.log("Apellido: ", apellido)
    console.log("Tipo de Documento: ", tipo_documento)
    console.log("Documento: ", documento)
    console.log("Correo Electronico: ", correo)
    console.log("N Telefono: ", telefono1)
    console.log("Usuario: ", usuario)
    console.log("Contraseña: ", contraseña)

    const sql = `
      INSERT INTO usuarios 
      (nombre, apellido, tipo_documento, documento, correo, telefono, usuario, contraseña, rol)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [nombre, apellido, tipo_documento, documento, correo, telefono1, usuario, contraseña, rol], (err) => {
      if (err) {
        console.error("❌ Error al registrar:", err);
        return res.status(500).send("Error al registrar");
      }
      res.status(200).json({ mensaje: "✅ Usuario registrado con éxito" });
    });
});

app.post("/login", (req, res) => {
    const { usuario, contraseña } = req.body;

    console.log("INTENTO DE INICIO DE SESION:");
    console.log("Usuario: ", usuario);
    console.log("Contraseña: ", contraseña);

    const sql = "SELECT * FROM usuarios WHERE usuario = ? AND contraseña = ?";

    db.query(sql, [usuario, contraseña], (err, results) => {
      if (err) {
        console.error("❌ Error al verificar usuario:", err);
        return res.status(500).json({ mensaje: "Error interno del servidor" });
      }
  
      if (results.length === 1) {
        console.log("✅ Usuario autenticado:", results[0].usuario);
        res.status(200).json({ 
          mensaje: "Inicio de sesión exitoso", 
          id_usuario: results[0].id_usuario 
        });
      } else {
        console.warn("⚠ Usuario o contraseña incorrectos");
        res.status(401).json({ mensaje: "Usuario o contraseña incorrectos" });
      }
    });
});

// ================== RECUPERACIÓN DE CONTRASEÑA ==================

const codigosRecuperacion = {}; // { correo: codigo }

app.post("/enviar-codigo", (req, res) => {
  const { correo } = req.body;

  const sql = "SELECT * FROM usuarios WHERE correo = ?";
  db.query(sql, [correo], (err, results) => {
    if (err) return res.status(500).json({ mensaje: "Error en el servidor" });
    if (results.length === 0) return res.status(404).json({ mensaje: "Correo no registrado" });

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    codigosRecuperacion[correo] = codigo;

    const mailOptions = {
      from: process.env.CORREO_EMISOR,
      to: correo,
      subject: "Recuperación de contraseña",
      text: `Tu código de recuperación es: ${codigo}`
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) return res.status(500).json({ mensaje: "Error al enviar correo" });
      res.status(200).json({ mensaje: "Código enviado por correo", correo });
      console.log("Enviando codigo de recuperacion a : ", correo)
    });
  });
});

app.post("/verificar-codigo", (req, res) => {
  const { correo, codigo } = req.body;
  if (codigosRecuperacion[correo] === codigo) {
    res.status(200).json({ mensaje: "Código verificado" });
  } else {
    res.status(400).json({ mensaje: "Código incorrecto" });
  }
  console.log("El Codigo Ingresado Es: ",codigo)
});

app.put("/cambiar-contrasena", (req, res) => {
  const { correo, nuevaContrasena } = req.body;
  const sql = "UPDATE usuarios SET contraseña = ? WHERE correo = ?";
  db.query(sql, [nuevaContrasena, correo], (err) => {
    if (err) return res.status(500).send("Error al cambiar contraseña");
    delete codigosRecuperacion[correo];
    res.status(200).json({ mensaje: "Contraseña actualizada con éxito" });
  });
  console.log("La Nueva Contraseña Es: ",nuevaContrasena)
});

// ================== CARPETAS Y ASISTENCIA ==================
app.post("/guardar-carpeta", (req, res) => {
  const { nombre, fecha, estudiantes, id_usuario, id_carpeta } = req.body;

  if (!nombre || !fecha || !estudiantes || !id_usuario) {
    return res.status(400).json({ mensaje: "Faltan datos para guardar carpeta" });
  }

  const datosJSON = JSON.stringify(estudiantes);

  // Función para procesar estudiantes
  const procesarEstudiantes = (carpetaId) => {
    const tareas = estudiantes.map(est => {
      return new Promise((resolve, reject) => {
        if (!est.id || est.id.trim() === "") return resolve(); // Ignorar sin ID

        const buscarSql = "SELECT id_estudiante FROM estudiantes WHERE id_estudiante = ?";
        db.query(buscarSql, [est.id], (errBuscar, resultadoBuscar) => {
          if (errBuscar) return reject(errBuscar);

          const continuar = () => {
            const estadoNormalizado =
              est.asistencia === "Asistió" ? "asistio" :
              est.asistencia === "Ausente" ? "ausente" :
              est.asistencia || "ausente";

            const hora = new Date().toLocaleTimeString("es-CO", { hour12: false });

            const asistenciaSql = `
              INSERT INTO registro_de_asistencia (id_estudiante, fecha, hora, estado, carpeta_id)
              VALUES (?, ?, ?, ?, ?)
            `;
            db.query(asistenciaSql, [est.id, fecha, hora, estadoNormalizado, carpetaId], (err2) => {
              if (err2) return reject(err2);
              resolve();
            });
          };

          if (resultadoBuscar.length === 0) {
            const insertEstSql = "INSERT INTO estudiantes (id_estudiante, nombre, apellido) VALUES (?, ?, ?)";
            db.query(insertEstSql, [est.id, est.nombre, est.apellido], (errInsert) => {
              if (errInsert) return reject(errInsert);
              continuar();
            });
          } else {
            continuar();
          }
        });
      });
    });

    Promise.all(tareas)
      .then(() => {
        res.status(200).json({ mensaje: id_carpeta ? "✏ Carpeta actualizada" : "✅ Carpeta guardada con éxito" });
      })
      .catch(error => {
        console.error("❌ Error al procesar asistencia:", error);
        res.status(500).json({ mensaje: "Error en el proceso de asistencia" });
      });
  };

  // 🔁 Si es una edición
  if (id_carpeta) {
    const updateSql = "UPDATE carpetas SET nombre = ?, fecha = ?, datos = ?, id_usuario = ? WHERE id = ?";
    db.query(updateSql, [nombre, fecha, datosJSON, id_usuario, id_carpeta], (err) => {
      if (err) {
        console.error("❌ Error al actualizar carpeta:", err);
        return res.status(500).json({ mensaje: "Error al actualizar carpeta" });
      }

      // 🧹 Eliminar asistencias anteriores
      const borrarAsistencias = "DELETE FROM registro_de_asistencia WHERE carpeta_id = ?";
      db.query(borrarAsistencias, [id_carpeta], (err2) => {
        if (err2) {
          console.error("❌ Error al borrar asistencias antiguas:", err2);
          return res.status(500).json({ mensaje: "Error al limpiar asistencias anteriores" });
        }

        procesarEstudiantes(id_carpeta); // 🔁 procesar asistencia actualizada
      });
    });
  } else {
    // 🆕 Carpeta nueva
    const insertarSql = "INSERT INTO carpetas (nombre, fecha, datos, id_usuario) VALUES (?, ?, ?, ?)";
    db.query(insertarSql, [nombre, fecha, datosJSON, id_usuario], (err, result) => {
      if (err) {
        console.error("❌ Error al guardar carpeta:", err);
        return res.status(500).json({ mensaje: "Error al guardar carpeta" });
      }

      const carpetaId = result.insertId;
      procesarEstudiantes(carpetaId); // ⏬ Insertar asistencias
    });
  }
});


app.get("/obtener-carpetas-usuario", (req, res) => {
  const id_usuario = req.query.id_usuario;

  if (!id_usuario) {
    return res.status(400).json({ mensaje: "Falta el ID del usuario" });
  }

  const sql = "SELECT * FROM carpetas WHERE id_usuario = ?";
  db.query(sql, [id_usuario], (err, results) => {
    if (err) {
      console.error("❌ Error al obtener carpetas del usuario:", err);
      return res.status(500).json({ mensaje: "Error en la consulta" });
    }
    res.status(200).json(results);
  });
});


app.get("/filtrar-carpetas-por-fecha", (req, res) => {
  const { id_usuario, fecha } = req.query;

  console.log("🔍📂 FILTRAR CARPETAS POR FECHA");
  console.log("📥 ID del usuario:", id_usuario);
  console.log("📅 Fecha recibida:", fecha);

  if (!id_usuario || !fecha) {
    console.warn("⚠️ Faltan parámetros de búsqueda");
    return res.status(400).json({ mensaje: "Faltan parámetros de búsqueda" });
  }

  const sql = "SELECT * FROM carpetas WHERE id_usuario = ? AND DATE(fecha) = ?";
  db.query(sql, [id_usuario, fecha], (err, results) => {
    if (err) {
      console.error("❌ Error al filtrar carpetas por fecha:", err);
      return res.status(500).json({ mensaje: "Error al consultar carpetas" });
    }

    console.log("✅ Carpetas encontradas:", results.length);
    console.log(JSON.stringify(results, null, 2)); // Imprime el resultado como JSON ordenado

    res.status(200).json(results);
  });
});




app.post("/actualizar-carpeta", (req, res) => {
  const { id_carpeta, nombre, fecha, estudiantes, id_usuario } = req.body;

  if (!id_carpeta || !nombre || !fecha || !estudiantes || !id_usuario) {
    return res.status(400).json({ mensaje: "Faltan datos para actualizar carpeta" });
  }

  const datosJSON = JSON.stringify(estudiantes);

  // 1. Verificar si la carpeta pertenece al usuario
  const verificarSql = "SELECT * FROM carpetas WHERE id = ? AND id_usuario = ?";
  db.query(verificarSql, [id_carpeta, id_usuario], (errVer, resVer) => {
    if (errVer) {
      console.error("❌ Error al verificar carpeta:", errVer);
      return res.status(500).json({ mensaje: "Error interno al verificar carpeta" });
    }

    if (resVer.length === 0) {
      return res.status(403).json({ mensaje: "No tienes permiso para modificar esta carpeta" });
    }

    // 2. Actualizar datos en la carpeta
    const actualizarSql = "UPDATE carpetas SET nombre = ?, fecha = ?, datos = ? WHERE id = ?";
    db.query(actualizarSql, [nombre, fecha, datosJSON, id_carpeta], (errUpdate) => {
      if (errUpdate) {
        console.error("❌ Error al actualizar carpeta:", errUpdate);
        return res.status(500).json({ mensaje: "Error al actualizar carpeta" });
      }

      // 3. Eliminar asistencias anteriores de esa carpeta
      const eliminarAsistencias = "DELETE FROM registro_de_asistencia WHERE carpeta_id = ?";
      db.query(eliminarAsistencias, [id_carpeta], (errDel) => {
        if (errDel) {
          console.error("❌ Error al eliminar asistencias previas:", errDel);
          return res.status(500).json({ mensaje: "Error al limpiar asistencias previas" });
        }

        // 4. Procesar estudiantes y nuevas asistencias
        const promesas = estudiantes.map(est => {
          return new Promise((resolve, reject) => {
            if (!est.id || est.id.trim() === "") return resolve(); // Ignorar sin ID

            const buscarSql = "SELECT id_estudiante FROM estudiantes WHERE id_estudiante = ?";
            db.query(buscarSql, [est.id], (errBuscar, resBuscar) => {
              if (errBuscar) return reject(errBuscar);

              const continuar = () => {
                const estadoNormalizado = est.asistencia === "Asistió" ? "asistio" : "ausente";
                const hora = new Date().toLocaleTimeString("es-CO", { hour12: false });

                const asistenciaSql = `
                  INSERT INTO registro_de_asistencia (id_estudiante, fecha, hora, estado, carpeta_id)
                  VALUES (?, ?, ?, ?, ?)
                `;
                db.query(asistenciaSql, [est.id, fecha, hora, estadoNormalizado, id_carpeta], (errAsis) => {
                  if (errAsis) return reject(errAsis);
                  resolve();
                });
              };

              if (resBuscar.length === 0) {
                const insertarEst = "INSERT INTO estudiantes (id_estudiante, nombre, apellido) VALUES (?, ?, ?)";
                db.query(insertarEst, [est.id, est.nombre, est.apellido], (errIns) => {
                  if (errIns) return reject(errIns);
                  continuar();
                });
              } else {
                continuar();
              }
            });
          });
        });

        Promise.all(promesas)
          .then(() => {
            res.status(200).json({ mensaje: " Carpeta editada correctamente ✅" });
          })
          .catch(err => {
            console.error("❌ Error al procesar estudiantes:", err);
            res.status(500).json({ mensaje: "Error al actualizar estudiantes" });
          });
      });
    });
  });
});


app.delete("/eliminar-carpeta/:id", (req, res) => {
  const carpetaId = req.params.id;

  if (!carpetaId) {
    return res.status(400).json({ mensaje: "Falta el ID de la carpeta" });
  }

  // Paso 1: Eliminar la carpeta (con ON DELETE CASCADE en asistencia)
  const sqlEliminarCarpeta = "DELETE FROM carpetas WHERE id = ?";
  db.query(sqlEliminarCarpeta, [carpetaId], (err, result) => {
    if (err) {
      console.error("❌ Error al eliminar la carpeta:", err);
      return res.status(500).json({ mensaje: "Error al eliminar la carpeta" });
    }

    // Paso 2 (opcional): Eliminar estudiantes que ya no están en ninguna asistencia
    const sqlLimpiarEstudiantes = `
      DELETE FROM estudiantes 
      WHERE id_estudiante NOT IN (
        SELECT DISTINCT id_estudiante FROM registro_de_asistencia
      )
    `;

    db.query(sqlLimpiarEstudiantes, (err2) => {
      if (err2) {
        console.warn("⚠️ Carpeta eliminada, pero error eliminando estudiantes:", err2);
        return res.status(200).json({
          mensaje: "📁 Carpeta eliminada, pero algunos estudiantes no pudieron Eliminarse."
        });
      }

      console.log("🧹 Estudiantes sin asistencia eliminados.");
      res.status(200).json({ mensaje: "✅ Carpeta y estudiantes eliminados correctamente" });
    });
  });
});


app.delete("/eliminar-carpeta/:id", (req, res) => {
  const idCarpeta = req.params.id;

  if (!idCarpeta) {
    return res.status(400).json({ mensaje: "Falta el ID de la carpeta" });
  }

  const sql = "DELETE FROM carpetas WHERE id = ?";
  db.query(sql, [idCarpeta], (err, result) => {
    if (err) {
      console.error("❌ Error al eliminar carpeta:", err);
      return res.status(500).json({ mensaje: "Error al eliminar carpeta" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ mensaje: "No se encontró la carpeta" });
    }

    res.status(200).json({ mensaje: "🗑 Carpeta eliminada correctamente" });
  });
});


app.post("/guardarAcudiente", (req, res) => {
    const { id_estudiante, nombre, apellido, parentesco, correo } = req.body;

    if (!id_estudiante || !nombre || !apellido || !parentesco || !correo) {
        return res.status(400).json({ success: false, message: "Faltan campos." });
    }

    const sql = `
        INSERT INTO acudientes (id_estudiante, nombre, apellido, parentesco, correo)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [id_estudiante, nombre, apellido, parentesco, correo], (err, result) => {
        if (err) {
            console.error("❌ Error al insertar en la base de datos:", err);
            return res.status(500).json({ success: false });
        }

        res.json({ success: true });
    });
});



app.get('/obtenerAcudiente/:id', async (req, res) => {
    const idEstudiante = req.params.id;
    console.log("🔍 Solicitando acudientes del estudiante con ID:", idEstudiante);

    try {
        const [result] = await db.promise().query(
            'SELECT * FROM acudientes WHERE id_estudiante = ?',
            [idEstudiante]
        );

        res.json(result);
    } catch (error) {
        console.error("❌ Error al obtener acudientes:", error);
        res.status(500).json({ error: "Error al obtener los acudientes del estudiante." });
    }
});







// ================== INICIAR SERVIDOR ==================
const path = require("path");
app.use(express.static(path.join(__dirname, "../HTML")));

app.listen(3000, '0.0.0.0', () => {
  console.log("✅ Servidor corriendo en puerto 3000");
});












