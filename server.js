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

const doc = new GoogleSpreadsheet('1GALSgq5RhFv103c307XYeNoorQ5gAzxFR1Q64XMGr7Q', serviceAccountAuth);

// Función auxiliar para cargar info una sola vez o cuando sea necesario
async function inicializarDoc() {
    try {
        if (!doc.title) await doc.loadInfo();
    } catch (e) {
        console.error("Error al conectar con Google Sheets:", e);
    }
}

// 1. LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        await inicializarDoc();
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
        res.status(500).json({ success: false });
    }
});

// 2. CARGAR ESTACIONES
app.get('/api/estaciones', async (req, res) => {
    try {
        await inicializarDoc();
        const sheetEst = doc.sheetsByTitle['Estaciones']; 
        const sheetTirillas = doc.sheetsByTitle['TIRILLAS'];
        
        const [rowsEst, rowsTir] = await Promise.all([sheetEst.getRows(), sheetTirillas.getRows()]);

        const estaciones = rowsEst.map(row => {
            const id = row.get('ID_Estacion') || '';
            const datosTirilla = rowsTir.find(t => t.get('ID_Estacion') === id);

            return {
                id: id,
                nombre: row.get('Nombre') || '',
                direccion: row.get('Dirección') || '',
                credito: parseFloat(String(row.get('Crédito Disponible') || '0').replace(/[$,]/g, '').replace(/,/g, '')) || 0,
                precios: {
                    Extra: parseFloat(String(row.get('Precio Extra') || '0').replace(/[$,]/g, '')) || 0,
                    Supreme: parseFloat(String(row.get('Precio Supreme') || '0').replace(/[$,]/g, '')) || 0,
                    Diesel: parseFloat(String(row.get('Precio Diesel') || '0').replace(/[$,]/g, '')) || 0
                },
                capacidad: {
                    extra: Number(datosTirilla?.get('CAP_EXTRA')) || 0,
                    supreme: Number(datosTirilla?.get('CAP_SUPREME')) || 0,
                    diesel: Number(datosTirilla?.get('CAP_DIESEL')) || 0
                },
                volumenActual: {
                    extra: Number(datosTirilla?.get('VOL_EXTRA')) || 0,
                    supreme: Number(datosTirilla?.get('VOL_SUPREME')) || 0,
                    diesel: Number(datosTirilla?.get('VOL_DIESEL')) || 0
                },
                ultimaActualizacion: datosTirilla?.get('ULTIMA_ACTUALIZACION') || 'Sin fecha'
            };
        });
        res.json(estaciones);
    } catch (error) {
        res.status(500).json({ error: "Error al cargar estaciones" });
    }
});

// 3. GUARDAR PEDIDO
app.post('/api/pedidos', async (req, res) => {
    const pedido = req.body;
    try {
        await inicializarDoc();
        const sheet = doc.sheetsByTitle['Pedidos']; 
        const fechaFinal = pedido.fecha_registro || new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });

        await sheet.addRow({
            'FOLIO': pedido.folio,
            'FECHA DE REGISTRO': fechaFinal,
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
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. OBTENER PEDIDOS CON FILTRO DE BLOQUE (CORREGIDO Y OPTIMIZADO)
app.get('/api/obtener-pedidos', async (req, res) => {
    const { estaciones, rol, fechaFiltro } = req.query; 
    try {
        await inicializarDoc();
        const sheetPedidos = doc.sheetsByTitle['Pedidos'];
        const rowsPedidos = await sheetPedidos.getRows();

        let filasFiltradas = rowsPedidos;

        // --- FILTRO POR FECHA DE BLOQUE (Prioritario) ---
        if (fechaFiltro) {
            filasFiltradas = filasFiltradas.filter(row => {
                const bloque = row.get('BLOQUE DE PROGRAMACIÓN');
                if (!bloque) return false;
                // Comparamos solo la parte YYYY-MM-DD
                return bloque.toString().trim().includes(fechaFiltro.trim());
            });
        }

        // --- FILTRO POR ROL/ESTACIONES ---
        if (rol === 'Fletera') {
            filasFiltradas = filasFiltradas.filter(row => row.get('FLETERA') === estaciones);
        } else if (estaciones !== 'TODAS') {
            const idsPermitidos = estaciones ? estaciones.split(',').map(e => e.trim()) : [];
            // Si el usuario tiene estaciones asignadas, filtramos por nombre exacto en la hoja
            filasFiltradas = filasFiltradas.filter(row => {
                const estPedido = row.get('ESTACIÓN');
                return idsPermitidos.some(id => estPedido.includes(id)); 
            });
        }

        const pedidos = filasFiltradas.map(row => ({
            id: row.get('FOLIO'),
            fecha: row.get('FECHA DE REGISTRO'),
            bloque: row.get('BLOQUE DE PROGRAMACIÓN'),
            estacion: row.get('ESTACIÓN'),
            producto: row.get('TIPO DE PRODUCTO'),
            litros: row.get('LITROS'),
            total: row.get('TOTAL'),
            estatus: row.get('ESTATUS') || 'Pendiente'
        })).reverse(); // Ordenamos para ver lo más reciente

        const estadisticas = {
            pendientes: filasFiltradas.filter(r => r.get('ESTATUS') === 'Pendiente').length,
            enRuta: filasFiltradas.filter(r => r.get('ESTATUS') === 'En Ruta').length,
            entregados: filasFiltradas.filter(r => r.get('ESTATUS') === 'Entregado').length,
            programados: filasFiltradas.filter(r => r.get('ESTATUS') === 'Aceptado').length
        };

        res.json({ pedidos, estadisticas });
    } catch (error) {
        console.error("Error al obtener pedidos:", error);
        res.status(500).json({ success: false, message: "Error al leer Sheets" });
    }
});

// 5. ACTUALIZAR VOLUMEN
app.post('/api/actualizar-tirilla', async (req, res) => {
    const { id_estacion, volExtra, volSupreme, volDiesel } = req.body;
    try {
        await inicializarDoc();
        const sheet = doc.sheetsByTitle['TIRILLAS'];
        const rows = await sheet.getRows();
        const fila = rows.find(r => r.get('ID_Estacion') === id_estacion);
        
        if (fila) {
            fila.set('VOL_EXTRA', volExtra);
            fila.set('VOL_SUPREME', volSupreme);
            fila.set('VOL_DIESEL', volDiesel);
            fila.set('ULTIMA_ACTUALIZACION', new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
            await fila.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: "Estación no encontrada" });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// 6. REUBICACIÓN (SWAP)
app.post('/api/reubicar-pedido', async (req, res) => {
    const { folioOriginal, folioDestino, idOrden } = req.body;
    try {
        await inicializarDoc();
        const sheetPedidos = doc.sheetsByTitle['Pedidos'];
        const rowsP = await sheetPedidos.getRows();

        const pOriginal = rowsP.find(r => r.get('FOLIO') === folioOriginal);
        const pDestino = rowsP.find(r => r.get('FOLIO') === folioDestino);

        if (pOriginal && pDestino) {
            pDestino.set('FLETERA', pOriginal.get('FLETERA'));
            pDestino.set('ORDEN', idOrden);
            pDestino.set('ESTATUS', 'En Ruta');
            
            pOriginal.set('ORDEN', '');
            pOriginal.set('ESTATUS', 'Pendiente');
            pOriginal.set('CONFIRMACIÓN O REUBICACIÓN', `Reubicada al FOLIO: ${folioDestino}`);

            await Promise.all([pDestino.save(), pOriginal.save()]);
            res.json({ success: true });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 7. CONFIRMAR BLOQUE (PROGRAMACIÓN LOGÍSTICA)
app.post('/api/confirmar-bloque', async (req, res) => {
    const idsPedidos = req.body.idsPedidos || req.body.pedidos;
    const bloqueProgramacion = req.body.bloqueProgramacion || req.body.fechaProgramada;
    
    if (!idsPedidos || !bloqueProgramacion) {
        return res.status(400).json({ success: false, message: "Faltan datos" });
    }

    try {
        await inicializarDoc();
        const sheet = doc.sheetsByTitle['Pedidos'];
        const rows = await sheet.getRows();

        for (let id of idsPedidos) {
            const row = rows.find(r => r.get('FOLIO').toString() === id.toString());
            if (row) {
                row.set('BLOQUE DE PROGRAMACIÓN', bloqueProgramacion);
                row.set('ESTATUS', 'Aceptado'); 
                await row.save();
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));