import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// 1. MODELO DE DATOS
const orderSchema = new mongoose.Schema({
  customerName: String,
  fuelType: String,
  gallons: Number,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// 2. RUTA PARA RECIBIR PEDIDOS
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, fuelType, gallons } = req.body;

    // A. Guardar en MongoDB Atlas
    const newOrder = new Order({ customerName, fuelType, gallons });
    await newOrder.save();
    console.log('✅ Pedido guardado en MongoDB');

    // B. Enviar a Google Sheets
    const GOOGLE_URL = 'https://script.google.com/macros/s/AKfycbwgJ5HvENym0-QX_esnFnqq2mHWDlz2p_9UPHWQbC8xUCVgfZCqBnws_1WY86OJrLwawg/exec'; 
    
    await axios.post(GOOGLE_URL, { customerName, fuelType, gallons });
    console.log('📊 Datos enviados a Google Sheets');

    res.status(201).json({ message: 'Pedido procesado', order: newOrder });
  } catch (error) {
    console.error('❌ Error en el proceso:', error.message);
    res.status(500).json({ error: 'Fallo al procesar pedido' });
  }
});

// 3. CONEXIÓN FINAL (LINK DE COMPATIBILIDAD PRO)
// Este link ignora el error querySrv y conecta directo a los nodos
const URI = "mongodb://User23:Test1598@polimotorsproject-shard-00-00.t03yona.mongodb.net:27017,polimotorsproject-shard-00-01.t03yona.mongodb.net:27017,polimotorsproject-shard-00-02.t03yona.mongodb.net:27017/mobil_db?ssl=true&replicaSet=atlas-t03yona-shard-0&authSource=admin&retryWrites=true&w=majority";

console.log('⏳ Intentando conectar a la base de datos...');

mongoose.connect(URI)
  .then(() => {
    console.log('**********************************************');
    console.log('✅ EXITO: MOBIL conectado a MongoDB Atlas');
    console.log('**********************************************');
  })
  .catch((err) => {
    console.error('❌ Error crítico de conexión:', err.message);
  });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);

});
