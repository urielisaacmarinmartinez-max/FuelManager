import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// --- ESTO SIRVE TU PORTAL WEB ---
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para la base de datos (tu API)
app.post('/api/pedido', async (req, res) => {
    console.log("Datos recibidos:", req.body);
    // Aquí irá tu lógica para Guardar en Mongo y Google Sheets
    res.json({ mensaje: "✅ Pedido recibido en el servidor" });
});

// CONEXIÓN A MONGO
const URI = process.env.MONGODB_URI;
mongoose.connect(URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error de conexión:', err));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor listo en puerto ${PORT}`));