require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { generarReporteVentasAvanzado } = require('./excelService');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

// 📱 Rutas directas para Service Worker y Manifest PWA
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Conexión Supabase
const supabaseUrl = process.env.SUPABASE_URL ? process.env.SUPABASE_URL.trim() : '';
const supabaseKey = process.env.SUPABASE_KEY ? process.env.SUPABASE_KEY.trim() : '';
const supabase = createClient(supabaseUrl, supabaseKey);

const USUARIOS = {
    panatech: {
        'npanadisi': 'Asdasdasd123!',
        'mpanadisi': 'Taxi1781!',
        'jpanadisi': 'Taxi1781!',
        'bprimo': 'Austra2706!'
    },
    incanto: {
        'npanadisi': 'Asdasdasd123',
        'bprimo': 'Austra2706!'
    }
};

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/logos/favicon.png">
        <link rel="manifest" href="/manifest.json">
        <title>Registrador de Ventas</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
        <div class="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md text-center space-y-6">
            <h1 class="text-2xl font-bold tracking-wide text-slate-100">Registrador de Ventas</h1>
            <p class="text-sm text-slate-400">Seleccioná la marca para ingresar</p>
            
            <div class="grid grid-cols-2 gap-4 pt-2">
                <a href="/login/panatech" class="flex items-center justify-center bg-slate-900 hover:bg-slate-950 p-6 rounded-2xl border border-sky-500/30 hover:border-sky-500 transition transform hover:-translate-y-1 shadow-lg group">
                    <img src="/logos/panatech.png" alt="Panatech" class="w-24 h-24 object-contain group-hover:scale-105 transition" onerror="this.src='https://cdn-icons-png.flaticon.com/512/891/891462.png'">
                </a>
                <a href="/login/incanto" class="flex items-center justify-center bg-slate-900 hover:bg-slate-950 p-6 rounded-2xl border border-rose-500/30 hover:border-rose-500 transition transform hover:-translate-y-1 shadow-lg group">
                    <img src="/logos/incanto.png" alt="Incanto" class="w-24 h-24 object-contain group-hover:scale-105 transition" onerror="this.src='https://cdn-icons-png.flaticon.com/512/891/891462.png'">
                </a>
            </div>
        </div>
    </body>
    </html>
    `);
});

function renderLogin(res, marca, errorMsg = null) {
    const brand = marca.toLowerCase();
    const esPanatech = brand === 'panatech';
    const colorBg = esPanatech ? 'bg-sky-600 hover:bg-sky-500' : 'bg-rose-600 hover:bg-rose-500';
    const colorTexto = esPanatech ? 'text-sky-400' : 'text-rose-400';
    const titulo = esPanatech ? 'PANATECH' : 'INCANTO';
    const logoImg = esPanatech ? '/logos/panatech.png' : '/logos/incanto.png';

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/logos/favicon.png">
        <link rel="manifest" href="/manifest.json">
        <title>Login - ${titulo}</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
        <div class="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-sm text-center space-y-5">
            <img src="${logoImg}" alt="${titulo}" class="w-16 h-16 mx-auto object-contain" onerror="this.style.display='none'">
            <h2 class="text-2xl font-extrabold tracking-wider ${colorTexto}">${titulo}</h2>
            <p class="text-xs text-slate-400">Ingresá tus credenciales de acceso</p>

            ${errorMsg ? `
                <div class="bg-red-500/20 border border-red-500/50 text-red-300 text-xs py-2.5 px-3 rounded-lg font-medium animate-pulse">
                    ⚠️ ${errorMsg}
                </div>
            ` : ''}

            <form action="/login/${brand}" method="POST" class="space-y-3">
                <input type="text" name="usuario" placeholder="Usuario" required autocomplete="username" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-white focus:outline-none focus:border-slate-500">
                <input type="password" name="password" placeholder="Contraseña" required autocomplete="current-password" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-white focus:outline-none focus:border-slate-500">
                <button type="submit" class="w-full ${colorBg} font-bold py-3 rounded-lg shadow-lg transition">Ingresar</button>
            </form>
            
            <a href="/" class="block text-xs text-slate-500 hover:underline pt-2">← Volver al inicio</a>
        </div>
    </body>
    </html>
    `);
}

app.get('/login/:marca', (req, res) => renderLogin(res, req.params.marca));

app.post('/login/:marca', (req, res) => {
    const marca = req.params.marca.toLowerCase();
    const { usuario, password } = req.body;
    const usuariosMarca = USUARIOS[marca];

    if (usuariosMarca && usuariosMarca[usuario] && usuariosMarca[usuario] === password) {
        res.redirect(`/app.html?marca=${marca}&usuario=${encodeURIComponent(usuario)}`);
    } else {
        renderLogin(res, marca, 'Usuario o contraseña incorrectos');
    }
});

// API Métricas de Hoy (Mini-Dashboard)
app.get('/api/metricas/hoy', async (req, res) => {
    const { marca } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

    // Fecha actual en hora local / ISO string YYYY-MM-DD
    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        const { data: ordenesHoy, error } = await supabase
            .from('ordenes')
            .select('id, total, estado, modo_entrega, costo_envio, fecha')
            .ilike('numero_orden', `${prefijo}%`)
            .gte('fecha', hoyStr);

        if (error) throw error;

        const totalVentas = (ordenesHoy || [])
            .filter(o => o.estado !== 'Cancelado')
            .reduce((acc, o) => acc + (parseFloat(o.total) || 0), 0);

        const cantOrdenes = (ordenesHoy || []).length;

        // Envíos pendientes (no finalizados ni cancelados)
        const { count: enviosPendientes } = await supabase
            .from('ordenes')
            .select('*', { count: 'exact', head: true })
            .ilike('numero_orden', `${prefijo}%`)
            .eq('modo_entrega', 'Envio')
            .neq('estado', 'Finalizado')
            .neq('estado', 'Cancelado');

        res.json({
            totalVentas,
            cantOrdenes,
            enviosPendientes: enviosPendientes || 0
        });
    } catch (err) {
        res.json({ totalVentas: 0, cantOrdenes: 0, enviosPendientes: 0 });
    }
});

// API Buscar Productos (Optimizada con filtro DB y stock)
app.get('/api/productos/buscar', async (req, res) => {
    const { q, marca } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();

    try {
        let query = supabase
            .from('productos')
            .select('*')
            .eq('marca', marcaTarget);

        if (q && q.trim().length > 0) {
            const termino = q.trim();
            query = query.or(`nombre.ilike.%${termino}%,codigo_sku.ilike.%${termino}%,variante.ilike.%${termino}%`);
        }

        const { data, error } = await query.order('nombre', { ascending: true }).limit(20);

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Modificar Nombre, Precio y Stock
app.put('/api/productos/:id/stock', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock } = req.body;

    try {
        const updateData = {};
        if (nombre !== undefined && nombre.trim() !== '') updateData.nombre = nombre.trim();
        if (precio !== undefined) updateData.precio = parseFloat(precio);
        if (stock !== undefined) updateData.stock = parseInt(stock);

        const { data, error } = await supabase
            .from('productos')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, mensaje: 'Producto actualizado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Eliminar Producto del Catálogo
app.delete('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Verificar si está referenciado en órdenes históricas
        const { data: details, error: checkErr } = await supabase
            .from('orden_detalles')
            .select('id')
            .eq('producto_id', id)
            .limit(1);

        if (checkErr) throw checkErr;

        if (details && details.length > 0) {
            // Producto en órdenes históricas: dejar en stock 0 para no romper ventas pasadas
            await supabase
                .from('productos')
                .update({ stock: 0 })
                .eq('id', id);

            return res.json({ 
                success: true, 
                esReferenciado: true,
                mensaje: 'El producto está asociado a ventas históricas; se ha puesto su stock en 0.' 
            });
        }

        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ success: true, esReferenciado: false, mensaje: 'Producto eliminado del catálogo correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Crear Producto Manual
app.post('/api/productos/manual', async (req, res) => {
    const { nombre, variante, precio, stock, marca } = req.body;
    try {
        const codigo_sku = `MAN-${Date.now().toString().slice(-6)}`;
        const { data, error } = await supabase.from('productos').insert([{
            codigo_sku, 
            nombre, 
            variante: variante || 'Única', 
            precio: parseFloat(precio) || 0, 
            stock: parseInt(stock) || 10,
            marca: (marca || 'panatech').toLowerCase()
        }]).select().single();

        if (error) return res.status(400).json({ success: false, error: error.message });
        res.json({ success: true, producto: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Últimas Órdenes (Incluye orden_detalles y productos para acciones rápidas)
app.get('/api/ordenes/ultimas', async (req, res) => {
    const { marca, limite } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';
    const limitNum = parseInt(limite) || 20;

    try {
        const { data, error } = await supabase
            .from('ordenes')
            .select(`*, orden_detalles(*, productos(*))`)
            .ilike('numero_orden', `${prefijo}%`)
            .order('id', { ascending: false })
            .limit(limitNum);

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.json([]);
    }
});

// API Crear Orden
app.post('/api/ordenes', async (req, res) => {
    const { fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, productos, total, estado, metodo_pago, marca } = req.body;

    try {
        const marcaTarget = (marca || 'panatech').toLowerCase();
        const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

        const { count } = await supabase
            .from('ordenes')
            .select('*', { count: 'exact', head: true })
            .ilike('numero_orden', `${prefijo}%`);

        const numero_orden = `${prefijo}-${1000 + (count || 0) + 1}`;

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden, fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio: costo_envio || 0, horario_envio, total, estado: estado || 'Iniciado', metodo_pago: metodo_pago || 'Sin especificar'
            }])
            .select()
            .single();

        if (errOrden) throw errOrden;

        if (productos && Array.isArray(productos)) {
            for (const item of productos) {
                await supabase.from('orden_detalles').insert([{
                    orden_id: orden.id,
                    producto_id: item.id,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio
                }]);

                if (estado === 'Finalizado') {
                    const { data: prod } = await supabase.from('productos').select('stock').eq('id', item.id).single();
                    if (prod) {
                        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - item.cantidad) }).eq('id', item.id);
                    }
                }
            }
        }

        res.json({ success: true, numero_orden, id: orden.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Buscar Orden
app.get('/api/ordenes/buscar/:num', async (req, res) => {
    const { marca } = req.query;
    const num = req.params.num.trim().toUpperCase();
    const formattedNum = num.startsWith('#') ? num : `#${num}`;
    
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const prefijoPermitido = marcaTarget === 'incanto' ? '#INC' : '#PAN';

    if (!formattedNum.startsWith(prefijoPermitido)) {
        return res.status(403).json({ error: `No tenés permisos para buscar o editar pedidos de ${formattedNum.startsWith('#INC') ? 'Incanto' : 'Panatech'}.` });
    }

    const { data: orden, error } = await supabase
        .from('ordenes')
        .select(`*, orden_detalles(*, productos(*))`)
        .eq('numero_orden', formattedNum)
        .single();

    if (error || !orden) return res.status(404).json({ error: 'Orden no encontrada.' });
    res.json(orden);
});

// API Actualización Rápida de Estado (Iniciado -> Abonado -> Preparado -> Finalizado -> Cancelado)
app.patch('/api/ordenes/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    try {
        const { data: ordenAnterior } = await supabase.from('ordenes').select('estado').eq('id', id).single();
        const estabaFinalizado = ordenAnterior ? ordenAnterior.estado === 'Finalizado' : false;

        const { error: errUpdate } = await supabase
            .from('ordenes')
            .update({ estado })
            .eq('id', id);

        if (errUpdate) throw errUpdate;

        // Descontar stock si pasa a Finalizado y antes no lo estaba
        if (estado === 'Finalizado' && !estabaFinalizado) {
            const { data: detalles } = await supabase.from('orden_detalles').select('producto_id, cantidad').eq('orden_id', id);
            if (detalles && Array.isArray(detalles)) {
                for (const item of detalles) {
                    const { data: prod } = await supabase.from('productos').select('stock').eq('id', item.producto_id).single();
                    if (prod) {
                        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - item.cantidad) }).eq('id', item.producto_id);
                    }
                }
            }
        }

        res.json({ success: true, mensaje: `Estado actualizado a ${estado}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Actualizar Orden Completa
app.put('/api/ordenes/:id', async (req, res) => {
    const { id } = req.params;
    const { fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, total, estado, metodo_pago, productos } = req.body;

    try {
        const { data: ordenAnterior } = await supabase.from('ordenes').select('estado').eq('id', id).single();
        const estabaFinalizado = ordenAnterior ? ordenAnterior.estado === 'Finalizado' : false;

        const { error: errUpdate } = await supabase
            .from('ordenes')
            .update({ fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, total, estado, metodo_pago: metodo_pago || 'Sin especificar' })
            .eq('id', id);

        if (errUpdate) throw errUpdate;

        if (productos && Array.isArray(productos)) {
            await supabase.from('orden_detalles').delete().eq('orden_id', id);

            for (const item of productos) {
                await supabase.from('orden_detalles').insert([{
                    orden_id: id,
                    producto_id: item.id,
                    cantidad: item.cantidad,
                    precio_unitario: item.precio
                }]);

                if (estado === 'Finalizado' && !estabaFinalizado) {
                    const { data: prod } = await supabase.from('productos').select('stock').eq('id', item.id).single();
                    if (prod) {
                        await supabase.from('productos').update({ stock: Math.max(0, prod.stock - item.cantidad) }).eq('id', item.id);
                    }
                }
            }
        }

        res.json({ success: true, mensaje: 'Orden y productos actualizados correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Exportar EXCEL Avanzado con Dashboard, KPIs, Rankings y Análisis Profundo
app.get('/api/ordenes/exportar', async (req, res) => {
    const { desde, hasta, marca } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

    try {
        let query = supabase
            .from('ordenes')
            .select(`*, orden_detalles(*, productos(*))`)
            .ilike('numero_orden', `${prefijo}%`);

        if (desde) query = query.gte('fecha', desde);
        if (hasta) query = query.lte('fecha', hasta);

        const { data: ordenes, error } = await query.order('id', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        const workbook = await generarReporteVentasAvanzado(ordenes || [], marcaTarget, desde, hasta);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=informe_ventas_${marcaTarget}_${desde || 'inicio'}_al_${hasta || 'hoy'}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
}

module.exports = app;