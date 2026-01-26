const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const app = express();

app.use(express.json());
app.use(express.static('public'));

// CONFIGURACIÓN DE GOOGLE SHEETS
const serviceAccountAuth = new JWT({
  email: require('./google-auth.json').client_email,
  key: require('./google-auth.json').private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// REEMPLAZA ESTE ID CON EL TUYO
const doc = new GoogleSpreadsheet('TU_ID_DE_HOJA_AQUÍ', serviceAccountAuth);

// RUTA DE LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Usuarios']; 
        const rows = await sheet.getRows();
        
        // Buscar coincidencia (Usa .toLowerCase() para evitar errores de dedo en el email)
        const user = rows.find(r => r.get('email').toLowerCase() === email.toLowerCase() && r.get('password') === password.toString());
        
        if (user) {
            res.json({ 
                success: true, 
                user: {
                    nombre: user.get('nombre'),
                    rol: user.get('rol'),
                    estaciones: user.get('estaciones')
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Datos incorrectos' });
        }
    } catch (error) {
        console.error("Error en Login:", error);
        res.status(500).json({ success: false, message: 'Error al conectar con la base de datos' });
    }
});

// NUEVA RUTA: OBTENER ESTACIONES DESDE EL EXCEL
app.get('/api/estaciones', async (req, res) => {
    try {
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Estaciones']; 
        const rows = await sheet.getRows();
        
        // Transformar las filas del Excel en un formato que el navegador entienda
        const estaciones = rows.map(row => ({
            id: row.get('id_estacion'),
            nombre: row.get('nombre_estacion'),
            direccion: row.get('direccion'),
            precios: {
                "Extra": parseFloat(row.get('precio_extra')) || 0,
                "Supreme": parseFloat(row.get('precio_supreme')) || 0,
                "Diesel": parseFloat(row.get('precio_diesel')) || 0
            },
            credito: parseFloat(row.get('credito_disponible')) || 0
        }));

        res.json(estaciones);
    } catch (error) {
        console.error("Error al cargar estaciones:", error);
        res.status(500).json({ success: false, message: 'No se pudo cargar la lista de estaciones' });
    }
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor MOBIL corriendo en puerto ${PORT}`));