import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const keys = require('./google-auth.json');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const serviceAccountAuth = new JWT({
  email: keys.client_email,
  key: keys.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// REEMPLAZA CON TU ID REAL
const doc = new GoogleSpreadsheet('TU_ID_DE_LA_HOJA', serviceAccountAuth);

// 1. LOGIN (Pestaña "Usuarios")
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Usuarios']; 
        const rows = await sheet.getRows();
        
        const user = rows.find(r => {
            const rowEmail = r.get('EMAIL');
            const rowPass = r.get('PASSWORD');
            return rowEmail && rowPass && 
                   rowEmail.toString().toLowerCase() === email.toLowerCase() && 
                   rowPass.toString() === password.toString();
        });
        
        if (user) {
            res.json({ 
                success: true, 
                user: {
                    nombre: user.get('NOMBRE'),
                    rol: user.get('ROL'),
                    estaciones: user.get('ESTACIONES')
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Datos incorrectos' });
        }
    } catch (error) {
        console.error("Error en Login:", error);
        res.status(500).json({ success: false });
    }
});

// 2. CARGAR ESTACIONES (Pestaña "Estaciones")
app.get('/api/estaciones', async (req, res) => {
    try {
        const sheet = doc.sheetsByTitle['Estaciones']; // Asegúrate que se llame exactamente así
        const rows = await sheet.getRows();
        
        const estaciones = rows.map(row => ({
            // Usamos || para que busque de ambas formas
            id: row.get('ID_Estacion') || row.get('id_estacion') || row.get('ID'),
            nombre: row.get('Nombre') || row.get('nombre'),
            direccion: row.get('Dirección') || row.get('direccion'),
            credito: parseFloat(row.get('Crédito Disponible') || row.get('credito')) || 0,
            precios: {
                Extra: parseFloat(row.get('Precio Extra') || row.get('extra')) || 0,
                Supreme: parseFloat(row.get('Precio Supreme') || row.get('supreme')) || 0,
                Diesel: parseFloat(row.get('Precio Diesel') || row.get('diesel')) || 0
            }
        }));
        
        res.json(estaciones);
    } catch (error) {
        console.error("Error cargando estaciones:", error);
        res.status(500).json({ error: "No se pudieron cargar las estaciones" });
    }
});

// 3. GUARDAR PEDIDO (Pestaña "Pedidos")
app.post('/api/pedidos', async (req, res) => {
    const pedido = req.body;
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Pedidos']; 
        
        await sheet.addRow({
            'FECHA DE REGISTRO': new Date().toLocaleString(),
            'ESTACIÓN': pedido.estacion,
            'TIPO DE PRODUCTO': pedido.combustible,
            'LITROS': pedido.litros,
            'TOTAL': pedido.total,
            'FECHA DE ENTREGA': pedido.fecha_entrega,
            'PRIORIDAD': pedido.prioridad,
            'ESTATUS': 'Pendiente',
            'USUARIO': pedido.usuario
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error al guardar pedido:", error);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));