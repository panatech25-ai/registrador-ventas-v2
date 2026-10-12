require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { generarReporteVentasAvanzado } = require('./excelService');
const { generarHTMLPresentacion } = require('./reportePresentacionService');

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

// Configuración por defecto de usuarios y permisos
const USUARIOS_DEFAULT = [
    {
        username: 'npanadisi',
        password: 'Asdasdasd123!',
        panatech: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: true }
        },
        incanto: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: true }
        }
    },
    {
        username: 'bprimo',
        password: 'Austra2706!',
        panatech: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: false }
        },
        incanto: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: true }
        }
    },
    {
        username: 'mpanadisi',
        password: 'Taxi1781!',
        panatech: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: false }
        },
        incanto: {
            habilitado: false,
            permisos: { nueva_orden: false, busqueda: false, stock: false, informes: false }
        }
    },
    {
        username: 'jpanadisi',
        password: 'Taxi1781!',
        panatech: {
            habilitado: true,
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: false }
        },
        incanto: {
            habilitado: false,
            permisos: { nueva_orden: false, busqueda: false, stock: false, informes: false }
        }
    }
];

// Helper para obtener y persistir usuarios en Supabase (en registro de configuración)
let usuariosCache = null;
let ultimaCargaUsuarios = 0;

async function obtenerUsuarios() {
    const ahora = Date.now();
    // Cache de 15 segundos para optimizar rendimiento
    if (usuariosCache && ahora - ultimaCargaUsuarios < 15000) {
        return usuariosCache;
    }

    try {
        const { data, error } = await supabase
            .from('ordenes')
            .select('observaciones')
            .eq('numero_orden', 'SYS_CONFIG_USUARIOS')
            .maybeSingle();

        if (error) {
            console.error('Error al leer usuarios de Supabase:', error.message);
        }

        if (data && data.observaciones) {
            const parsed = JSON.parse(data.observaciones);
            if (Array.isArray(parsed) && parsed.length > 0) {
                usuariosCache = parsed;
                ultimaCargaUsuarios = ahora;
                return usuariosCache;
            }
        }
    } catch (err) {
        console.error('Error al parsear usuarios:', err);
    }

    // Si aún no existe en Supabase, inicializarlo
    usuariosCache = USUARIOS_DEFAULT;
    ultimaCargaUsuarios = ahora;
    guardarUsuarios(usuariosCache).catch(() => {});
    return usuariosCache;
}

async function guardarUsuarios(listaUsuarios) {
    usuariosCache = listaUsuarios;
    ultimaCargaUsuarios = Date.now();
    const jsonStr = JSON.stringify(listaUsuarios);

    try {
        const { data: existente } = await supabase
            .from('ordenes')
            .select('id')
            .eq('numero_orden', 'SYS_CONFIG_USUARIOS')
            .maybeSingle();

        if (existente && existente.id) {
            await supabase
                .from('ordenes')
                .update({ observaciones: jsonStr })
                .eq('id', existente.id);
        } else {
            await supabase
                .from('ordenes')
                .insert([{
                    numero_orden: 'SYS_CONFIG_USUARIOS',
                    vendedor: 'sistema',
                    cliente_nombre: 'Configuración de Usuarios',
                    total: 0,
                    estado: 'Cancelado',
                    observaciones: jsonStr
                }]);
        }
        return true;
    } catch (err) {
        console.error('Error al guardar usuarios en Supabase:', err);
        return false;
    }
}

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="icon" type="image/png" href="/logos/favicon.png">
        <link rel="manifest" href="/manifest.json">
        <title>Selección de Emprendimiento - Registrador</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');
            body { font-family: 'Plus Jakarta Sans', sans-serif; }
        </style>
    </head>
    <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-4">
        <div class="bg-slate-900/90 p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-800 w-full max-w-md text-center space-y-6 backdrop-blur">
            <div>
                <span class="text-xs uppercase tracking-widest font-bold text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">Sistema de Ventas</span>
                <h1 class="text-2xl sm:text-3xl font-black tracking-wide text-white mt-3">Seleccionar Emprendimiento</h1>
                <p class="text-xs text-slate-400 mt-1">Elegí la marca para gestionar pedidos y stock</p>
            </div>
            
            <div class="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
                <!-- Tarjeta Panatech -->
                <a href="/login/panatech" class="flex flex-col items-center justify-center bg-slate-800/70 hover:bg-slate-800 p-5 rounded-2xl border border-sky-500/30 hover:border-sky-400 transition-all transform hover:-translate-y-1 shadow-lg group active:scale-95">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-slate-900 rounded-2xl p-2 border border-slate-700/60 flex items-center justify-center shadow-inner group-hover:scale-105 transition">
                        <img src="/logos/panatech.png" alt="Panatech" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/891/891462.png'">
                    </div>
                    <span class="mt-3 text-sm sm:text-base font-extrabold text-sky-400 tracking-wider">PANATECH</span>
                    <span class="text-[10px] text-slate-400 font-medium">Tecnología y Bazar</span>
                </a>

                <!-- Tarjeta Incanto -->
                <a href="/login/incanto" class="flex flex-col items-center justify-center bg-slate-800/70 hover:bg-slate-800 p-5 rounded-2xl border border-rose-500/30 hover:border-rose-400 transition-all transform hover:-translate-y-1 shadow-lg group active:scale-95">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-slate-900 rounded-2xl p-2 border border-slate-700/60 flex items-center justify-center shadow-inner group-hover:scale-105 transition">
                        <img src="/logos/incanto.png" alt="Incanto" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3050/3050239.png'">
                    </div>
                    <span class="mt-3 text-sm sm:text-base font-extrabold text-rose-400 tracking-wider">INCANTO</span>
                    <span class="text-[10px] text-slate-400 font-medium">Cosmética y Belleza</span>
                </a>
            </div>
            
            <div class="text-[10px] text-slate-500 border-t border-slate-800/80 pt-3">
                Panatech & Incanto • Registrador Oficial de Ventas
            </div>
        </div>
        
        <script>
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            }
        </script>
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

app.post('/login/:marca', async (req, res) => {
    const marca = req.params.marca.toLowerCase();
    const { usuario, password } = req.body;
    const userTarget = (usuario || '').trim().toLowerCase();
    
    try {
        const usuarios = await obtenerUsuarios();
        const usuarioEncontrado = usuarios.find(u => (u.username || '').toLowerCase() === userTarget);

        if (usuarioEncontrado && usuarioEncontrado.password === password) {
            // Verificar si el usuario está habilitado para esta marca
            const configMarca = usuarioEncontrado[marca];
            if (configMarca && configMarca.habilitado) {
                return res.redirect(`/app.html?marca=${marca}&usuario=${encodeURIComponent(usuarioEncontrado.username)}`);
            } else {
                return renderLogin(res, marca, `No tenés permisos para ingresar al emprendimiento ${marca.toUpperCase()}`);
            }
        }

        renderLogin(res, marca, 'Usuario o contraseña incorrectos');
    } catch (err) {
        renderLogin(res, marca, 'Error al procesar el inicio de sesión');
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

// Helpers para persistir el estado de pago del envío (Producto abonado / Abonado total)
function procesarObservacionesParaGuardar(observaciones = '', pago_envio = null) {
    let texto = (observaciones || '').replace(/\s*\[PAGO_ENVIO:[^\]]+\]\s*/g, '').trim();
    if (pago_envio === 'PRODUCTO_ABONADO' || pago_envio === 'ABONADO_TOTAL') {
        texto = texto ? `${texto} [PAGO_ENVIO:${pago_envio}]` : `[PAGO_ENVIO:${pago_envio}]`;
    }
    return texto;
}

function procesarOrdenParaRespuesta(orden) {
    if (!orden) return orden;
    let pago_envio = null;
    let obs = orden.observaciones || '';

    if (obs.includes('[PAGO_ENVIO:ABONADO_TOTAL]')) {
        pago_envio = 'ABONADO_TOTAL';
        obs = obs.replace(/\[PAGO_ENVIO:ABONADO_TOTAL\]/g, '').trim();
    } else if (obs.includes('[PAGO_ENVIO:PRODUCTO_ABONADO]')) {
        pago_envio = 'PRODUCTO_ABONADO';
        obs = obs.replace(/\[PAGO_ENVIO:PRODUCTO_ABONADO\]/g, '').trim();
    }
    orden.pago_envio = pago_envio;
    orden.observaciones = obs;
    return orden;
}

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
        res.json((data || []).map(procesarOrdenParaRespuesta));
    } catch (err) {
        res.json([]);
    }
});

// API Crear Orden
app.post('/api/ordenes', async (req, res) => {
    const { fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, productos, total, estado, metodo_pago, marca, pago_envio } = req.body;

    try {
        const marcaTarget = (marca || 'panatech').toLowerCase();
        const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

        const { count } = await supabase
            .from('ordenes')
            .select('*', { count: 'exact', head: true })
            .ilike('numero_orden', `${prefijo}%`);

        const numero_orden = `${prefijo}-${1000 + (count || 0) + 1}`;
        const obsFinal = procesarObservacionesParaGuardar(observaciones, pago_envio);

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden, fecha, vendedor, cliente_nombre, cliente_telefono, observaciones: obsFinal, modo_entrega, cadete, direccion_envio, costo_envio: costo_envio || 0, horario_envio, total, estado: estado || 'Iniciado', metodo_pago: metodo_pago || 'Sin especificar'
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

        res.json({ success: true, numero_orden, id: orden.id, pago_envio });
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
    res.json(procesarOrdenParaRespuesta(orden));
});

// API Búsqueda Avanzada de Órdenes (Filtros múltiples: texto, estado, vendedor, fecha, modo)
app.get('/api/ordenes/avanzada', async (req, res) => {
    const { marca, q, estado, vendedor, fechaDesde, fechaHasta, modo_entrega, limite } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';
    const limitNum = parseInt(limite) || 50;

    try {
        let query = supabase
            .from('ordenes')
            .select(`*, orden_detalles(*, productos(*))`)
            .ilike('numero_orden', `${prefijo}%`);

        if (q && q.trim()) {
            const termino = q.trim();
            // Buscar por número de orden, cliente o teléfono
            query = query.or(`numero_orden.ilike.%${termino}%,cliente_nombre.ilike.%${termino}%,cliente_telefono.ilike.%${termino}%`);
        }

        if (estado && estado !== 'TODOS') {
            if (estado === 'ENVIOS_PENDIENTES') {
                query = query
                    .eq('modo_entrega', 'Envio')
                    .neq('estado', 'Finalizado')
                    .neq('estado', 'Cancelado');
            } else {
                query = query.eq('estado', estado);
            }
        }

        if (vendedor && vendedor.trim()) {
            query = query.ilike('vendedor', `%${vendedor.trim()}%`);
        }

        if (modo_entrega && modo_entrega !== 'TODOS') {
            query = query.eq('modo_entrega', modo_entrega);
        }

        if (fechaDesde) {
            query = query.gte('fecha', fechaDesde);
        }

        if (fechaHasta) {
            query = query.lte('fecha', fechaHasta);
        }

        const { data, error } = await query
            .order('id', { ascending: false })
            .limit(limitNum);

        if (error) throw error;
        res.json((data || []).map(procesarOrdenParaRespuesta));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
    const { fecha, vendedor, cliente_nombre, cliente_telefono, observaciones, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, total, estado, metodo_pago, productos, pago_envio } = req.body;

    try {
        const { data: ordenAnterior } = await supabase.from('ordenes').select('estado').eq('id', id).single();
        const estabaFinalizado = ordenAnterior ? ordenAnterior.estado === 'Finalizado' : false;
        const obsFinal = procesarObservacionesParaGuardar(observaciones, pago_envio);

        const { error: errUpdate } = await supabase
            .from('ordenes')
            .update({ fecha, vendedor, cliente_nombre, cliente_telefono, observaciones: obsFinal, modo_entrega, cadete, direccion_envio, costo_envio, horario_envio, total, estado, metodo_pago: metodo_pago || 'Sin especificar' })
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

// ==========================================
// MÓDULO INCANTO MAYORISTA (Stock separado, Compras, Ventas, Métricas & MEP)
// ==========================================

// Cache en memoria para la cotización del Dólar MEP (10 minutos)
let dolarMepCache = null;
let ultimaCotizacionMep = 0;

app.get('/api/dolar/mep', async (req, res) => {
    const ahora = Date.now();
    if (dolarMepCache && (ahora - ultimaCotizacionMep < 10 * 60 * 1000)) {
        return res.json(dolarMepCache);
    }

    try {
        const respuesta = await fetch('https://dolarapi.com/v1/dolares/bolsa');
        if (!respuesta.ok) throw new Error('Error al consultar DolarAPI');
        const data = await respuesta.json();
        
        const valorVenta = parseFloat(data.venta) || 1540;
        const valorCompra = parseFloat(data.compra) || 1530;
        
        dolarMepCache = {
            mep: valorVenta,
            compra: valorCompra,
            venta: valorVenta,
            fechaActualizacion: data.fechaActualizacion || new Date().toISOString()
        };
        ultimaCotizacionMep = ahora;
        res.json(dolarMepCache);
    } catch (err) {
        console.error('Error al obtener Dólar MEP:', err.message);
        // Si falla, responder con cache previo o fallback prudente
        const fallback = dolarMepCache || { mep: 1540, compra: 1530, venta: 1540, fallback: true };
        res.json(fallback);
    }
});

// Métricas de Incanto Mayorista
// 1. Ventas del mes
// 2. Cantidad de Splash (stock de productos con nombre que contenga 'splash')
// 3. Valor estimado total en $ (suma de precio * stock)
app.get('/api/mayorista/metricas', async (req, res) => {
    try {
        const hoy = new Date();
        const inicioMesStr = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];

        // 1. Ventas del mes: órdenes con prefijo #INC-MAY-VTA-
        const { data: ventasMes, error: errVentas } = await supabase
            .from('ordenes')
            .select('total, estado, fecha')
            .ilike('numero_orden', '#INC-MAY-VTA-%')
            .gte('fecha', inicioMesStr);

        if (errVentas) throw errVentas;

        const totalVentasMes = (ventasMes || [])
            .filter(v => v.estado !== 'Cancelado')
            .reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);

        // 2 & 3. Stock y valor estimado de productos mayorista
        const { data: productos, error: errProds } = await supabase
            .from('productos')
            .select('id, nombre, stock, precio')
            .eq('marca', 'incanto_mayorista');

        if (errProds) throw errProds;

        let cantidadSplash = 0;
        let valorEstimadoTotal = 0;

        (productos || []).forEach(p => {
            const stock = parseInt(p.stock) || 0;
            const precio = parseFloat(p.precio) || 0;
            if (stock > 0) {
                valorEstimadoTotal += (stock * precio);
            }
            if ((p.nombre || '').toLowerCase().includes('splash')) {
                cantidadSplash += stock;
            }
        });

        res.json({
            ventasMes: totalVentasMes,
            cantidadSplash,
            valorEstimado: valorEstimadoTotal,
            totalProductos: (productos || []).length
        });
    } catch (err) {
        console.error('Error al calcular métricas mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Listar productos / catálogo propio de Incanto Mayorista
app.get('/api/mayorista/productos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('marca', 'incanto_mayorista')
            .order('nombre', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear o actualizar producto en stock mayorista
app.post('/api/mayorista/productos', async (req, res) => {
    const { id, nombre, variante, precio, stock } = req.body;
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre del producto es requerido.' });
    }

    try {
        if (id) {
            // Actualizar
            const { data, error } = await supabase
                .from('productos')
                .update({
                    nombre,
                    variante: variante || 'Mayorista',
                    precio: parseFloat(precio) || 0,
                    stock: parseInt(stock) || 0
                })
                .eq('id', id)
                .eq('marca', 'incanto_mayorista')
                .select()
                .single();

            if (error) throw error;
            return res.json({ success: true, producto: data });
        } else {
            // Crear
            const codigo_sku = `MAY-${Date.now().toString().slice(-6)}`;
            const { data, error } = await supabase
                .from('productos')
                .insert([{
                    codigo_sku,
                    nombre,
                    variante: variante || 'Mayorista',
                    precio: parseFloat(precio) || 0,
                    stock: parseInt(stock) || 0,
                    marca: 'incanto_mayorista'
                }])
                .select()
                .single();

            if (error) throw error;
            return res.json({ success: true, producto: data });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar transacciones recientes (Ventas y Compras)
app.get('/api/mayorista/transacciones', async (req, res) => {
    const { tipo, limite } = req.query; // tipo: 'ventas', 'compras', o all
    const limitNum = parseInt(limite) || 30;

    try {
        let query = supabase
            .from('ordenes')
            .select('*')
            .ilike('numero_orden', '#INC-MAY-%')
            .order('id', { ascending: false })
            .limit(limitNum);

        if (tipo === 'ventas') {
            query = query.ilike('numero_orden', '#INC-MAY-VTA-%');
        } else if (tipo === 'compras') {
            query = query.ilike('numero_orden', '#INC-MAY-CMP-%');
        }

        const { data, error } = await query;
        if (error) throw error;

        // Parsear datos de cada transacción
        const transacciones = (data || []).map(t => {
            let detalleJson = null;
            try {
                detalleJson = t.observaciones ? JSON.parse(t.observaciones) : null;
            } catch (e) {
                detalleJson = { texto: t.observaciones };
            }
            const esVenta = (t.numero_orden || '').includes('VTA');
            return {
                id: t.id,
                numero: t.numero_orden,
                tipo: esVenta ? 'venta' : 'compra',
                fecha: t.fecha,
                persona: t.cliente_nombre, // Cliente o Proveedor
                producto: detalleJson?.producto_nombre || 'Producto',
                cantidad: detalleJson?.cantidad || 1,
                precio_unitario: detalleJson?.precio_unitario || 0,
                total: parseFloat(t.total) || 0,
                estado: t.estado,
                vendedor: t.vendedor
            };
        });

        res.json(transacciones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar Venta Mayorista: Cliente, Producto, Cantidad, Importe
// Resta stock del producto en 'incanto_mayorista'
app.post('/api/mayorista/ventas', async (req, res) => {
    const { cliente, producto_id, producto_nombre, cantidad, importe, vendedor } = req.body;
    const cantNum = parseInt(cantidad) || 1;
    const totalNum = parseFloat(importe) || 0;
    const nombreProd = (producto_nombre || '').trim();

    if (!cliente || !nombreProd || totalNum <= 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: Cliente, Producto e Importe.' });
    }

    try {
        let prodTarget = null;
        if (producto_id) {
            const { data: p } = await supabase
                .from('productos')
                .select('*')
                .eq('id', producto_id)
                .eq('marca', 'incanto_mayorista')
                .maybeSingle();
            prodTarget = p;
        }

        // Si no se pasó ID o no se encontró, buscar por nombre exacto en mayorista o crearlo
        if (!prodTarget) {
            const { data: pExist } = await supabase
                .from('productos')
                .select('*')
                .eq('marca', 'incanto_mayorista')
                .ilike('nombre', nombreProd)
                .maybeSingle();

            if (pExist) {
                prodTarget = pExist;
            } else {
                // Crear producto nuevo en stock mayorista
                const codigo_sku = `MAY-${Date.now().toString().slice(-6)}`;
                const { data: pNew, error: pErr } = await supabase
                    .from('productos')
                    .insert([{
                        codigo_sku,
                        nombre: nombreProd,
                        variante: 'Mayorista',
                        precio: totalNum / (cantNum || 1),
                        stock: 0,
                        marca: 'incanto_mayorista'
                    }])
                    .select()
                    .single();
                if (pErr) throw pErr;
                prodTarget = pNew;
            }
        }

        // Descontar stock (no menor a 0)
        const nuevoStock = Math.max(0, (prodTarget.stock || 0) - cantNum);
        await supabase
            .from('productos')
            .update({ stock: nuevoStock })
            .eq('id', prodTarget.id);

        // Generar número de venta mayorista único
        const numVenta = `#INC-MAY-VTA-${Date.now().toString().slice(-6)}`;
        const fechaHoy = new Date().toISOString().split('T')[0];

        const detalleObj = {
            tipo: 'venta_mayorista',
            producto_id: prodTarget.id,
            producto_nombre: prodTarget.nombre,
            cantidad: cantNum,
            precio_unitario: totalNum / cantNum
        };

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden: numVenta,
                fecha: fechaHoy,
                vendedor: vendedor || 'sistema',
                cliente_nombre: cliente.trim(),
                total: totalNum,
                estado: 'Finalizado',
                modo_entrega: 'Mayorista',
                observaciones: JSON.stringify(detalleObj)
            }])
            .select()
            .single();

        if (errOrden) throw errOrden;

        res.json({
            success: true,
            numero: numVenta,
            stockRestante: nuevoStock,
            orden
        });
    } catch (err) {
        console.error('Error al registrar venta mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Registrar Compra Mayorista: Proveedor, Producto, Cantidad, Importe
// Suma stock al producto en 'incanto_mayorista'
app.post('/api/mayorista/compras', async (req, res) => {
    const { proveedor, producto_id, producto_nombre, cantidad, importe, vendedor } = req.body;
    const cantNum = parseInt(cantidad) || 1;
    const totalNum = parseFloat(importe) || 0;
    const nombreProd = (producto_nombre || '').trim();

    if (!proveedor || !nombreProd || totalNum <= 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: Proveedor, Producto e Importe.' });
    }

    try {
        let prodTarget = null;
        if (producto_id) {
            const { data: p } = await supabase
                .from('productos')
                .select('*')
                .eq('id', producto_id)
                .eq('marca', 'incanto_mayorista')
                .maybeSingle();
            prodTarget = p;
        }

        if (!prodTarget) {
            const { data: pExist } = await supabase
                .from('productos')
                .select('*')
                .eq('marca', 'incanto_mayorista')
                .ilike('nombre', nombreProd)
                .maybeSingle();

            if (pExist) {
                prodTarget = pExist;
            } else {
                // Crear producto nuevo en stock mayorista
                const codigo_sku = `MAY-${Date.now().toString().slice(-6)}`;
                const { data: pNew, error: pErr } = await supabase
                    .from('productos')
                    .insert([{
                        codigo_sku,
                        nombre: nombreProd,
                        variante: 'Mayorista',
                        precio: totalNum / (cantNum || 1),
                        stock: cantNum,
                        marca: 'incanto_mayorista'
                    }])
                    .select()
                    .single();
                if (pErr) throw pErr;
                prodTarget = pNew;
            }
        }

        // Si ya existía, sumar stock
        if (prodTarget && prodTarget.id) {
            const nuevoStock = (parseInt(prodTarget.stock) || 0) + cantNum;
            // Actualizar stock y mantener o actualizar precio de referencia
            await supabase
                .from('productos')
                .update({ 
                    stock: nuevoStock,
                    precio: prodTarget.precio > 0 ? prodTarget.precio : (totalNum / cantNum)
                })
                .eq('id', prodTarget.id);
            prodTarget.stock = nuevoStock;
        }

        // Generar número de compra mayorista único
        const numCompra = `#INC-MAY-CMP-${Date.now().toString().slice(-6)}`;
        const fechaHoy = new Date().toISOString().split('T')[0];

        const detalleObj = {
            tipo: 'compra_mayorista',
            producto_id: prodTarget.id,
            producto_nombre: prodTarget.nombre,
            cantidad: cantNum,
            precio_unitario: totalNum / cantNum
        };

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden: numCompra,
                fecha: fechaHoy,
                vendedor: vendedor || 'sistema',
                cliente_nombre: proveedor.trim(), // Se guarda el nombre del proveedor en cliente_nombre
                total: totalNum,
                estado: 'Finalizado',
                modo_entrega: 'Compra',
                observaciones: JSON.stringify(detalleObj)
            }])
            .select()
            .single();

        if (errOrden) throw errOrden;

        res.json({
            success: true,
            numero: numCompra,
            stockActual: prodTarget.stock,
            orden
        });
    } catch (err) {
        console.error('Error al registrar compra mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================

// Obtener permisos del usuario logueado para la marca actual
app.get('/api/permisos/mis-permisos', async (req, res) => {
    const { usuario, marca } = req.query;
    const userTarget = (usuario || '').toLowerCase().trim();
    const marcaTarget = (marca || 'panatech').toLowerCase().trim();

    try {
        const usuarios = await obtenerUsuarios();
        const u = usuarios.find(x => (x.username || '').toLowerCase() === userTarget);

        if (!u) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const configMarca = u[marcaTarget] || { habilitado: false, permisos: {} };
        const esAdmin = userTarget === 'npanadisi';

        res.json({
            username: u.username,
            marca: marcaTarget,
            habilitado: configMarca.habilitado,
            permisos: configMarca.permisos || {},
            esAdmin
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar todos los usuarios (Solo npanadisi)
app.get('/api/usuarios', async (req, res) => {
    const { usuario_solicitante } = req.query;
    if ((usuario_solicitante || '').toLowerCase().trim() !== 'npanadisi') {
        return res.status(403).json({ error: 'Solo el administrador npanadisi puede gestionar usuarios.' });
    }

    try {
        const usuarios = await obtenerUsuarios();
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar / Crear / Modificar usuario (Solo npanadisi)
app.post('/api/usuarios', async (req, res) => {
    const { usuario_solicitante, usuario } = req.body;
    if ((usuario_solicitante || '').toLowerCase().trim() !== 'npanadisi') {
        return res.status(403).json({ error: 'Solo el administrador npanadisi puede gestionar usuarios.' });
    }

    if (!usuario || !usuario.username || !usuario.password) {
        return res.status(400).json({ error: 'El nombre de usuario y la contraseña son obligatorios.' });
    }

    try {
        const usuarios = await obtenerUsuarios();
        const usernameNormalizado = usuario.username.trim().toLowerCase();
        
        const idx = usuarios.findIndex(u => (u.username || '').toLowerCase() === usernameNormalizado);

        const usuarioAguardar = {
            username: usuario.username.trim(),
            password: usuario.password.trim(),
            panatech: {
                habilitado: !!(usuario.panatech && usuario.panatech.habilitado),
                permisos: {
                    nueva_orden: !!(usuario.panatech?.permisos?.nueva_orden),
                    busqueda: !!(usuario.panatech?.permisos?.busqueda),
                    stock: !!(usuario.panatech?.permisos?.stock),
                    informes: !!(usuario.panatech?.permisos?.informes)
                }
            },
            incanto: {
                habilitado: !!(usuario.incanto && usuario.incanto.habilitado),
                permisos: {
                    nueva_orden: !!(usuario.incanto?.permisos?.nueva_orden),
                    busqueda: !!(usuario.incanto?.permisos?.busqueda),
                    stock: !!(usuario.incanto?.permisos?.stock),
                    informes: !!(usuario.incanto?.permisos?.informes)
                }
            }
        };

        if (idx >= 0) {
            usuarios[idx] = usuarioAguardar;
        } else {
            usuarios.push(usuarioAguardar);
        }

        const ok = await guardarUsuarios(usuarios);
        if (!ok) throw new Error('Error al guardar en base de datos');

        res.json({ success: true, usuario: usuarioAguardar });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar usuario (Solo npanadisi)
app.delete('/api/usuarios/:username', async (req, res) => {
    const { usuario_solicitante } = req.query;
    const { username } = req.params;

    if ((usuario_solicitante || '').toLowerCase().trim() !== 'npanadisi') {
        return res.status(403).json({ error: 'Solo el administrador npanadisi puede gestionar usuarios.' });
    }

    if ((username || '').toLowerCase().trim() === 'npanadisi') {
        return res.status(400).json({ error: 'No es posible eliminar al usuario administrador npanadisi.' });
    }

    try {
        let usuarios = await obtenerUsuarios();
        usuarios = usuarios.filter(u => (u.username || '').toLowerCase() !== (username || '').toLowerCase().trim());

        const ok = await guardarUsuarios(usuarios);
        if (!ok) throw new Error('Error al actualizar lista de usuarios');

        res.json({ success: true, mensaje: 'Usuario eliminado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Función de verificación de permisos de informes dinámica
async function verificarPermisoInformes(marca, usuario) {
    const user = (usuario || '').toLowerCase().trim();
    const brand = (marca || '').toLowerCase().trim();
    if (user === 'npanadisi') return true;

    try {
        const usuarios = await obtenerUsuarios();
        const u = usuarios.find(x => (x.username || '').toLowerCase() === user);
        if (u && u[brand] && u[brand].habilitado && u[brand].permisos) {
            return !!u[brand].permisos.informes;
        }
    } catch (err) {
        console.error('Error al verificar permiso:', err);
    }
    return false;
}

// Ruta Presentación Ejecutiva y Generador de PDF
app.get('/reporte-presentacion', async (req, res) => {
    const { desde, hasta, marca, usuario } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const usuarioTarget = (usuario || '').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

    const tienePermiso = await verificarPermisoInformes(marcaTarget, usuarioTarget);
    if (!tienePermiso) {
        return res.status(403).send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Acceso Restringido - Informes</title>
                <script src="https://cdn.tailwindcss.com"></script>
            </head>
            <body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-4">
                <div class="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-sm text-center space-y-4">
                    <div class="text-4xl">🚫</div>
                    <h1 class="text-xl font-bold text-rose-400">Acceso Restringido</h1>
                    <p class="text-xs text-slate-300">
                        No tenés permisos para visualizar los informes de <b class="uppercase">${marcaTarget}</b>.
                    </p>
                    <a href="/app.html?marca=${marcaTarget}&usuario=${encodeURIComponent(usuarioTarget)}" class="inline-block bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition">
                        ← Volver al Registrador
                    </a>
                </div>
            </body>
            </html>
        `);
    }

    try {
        let query = supabase
            .from('ordenes')
            .select(`*, orden_detalles(*, productos(*))`)
            .ilike('numero_orden', `${prefijo}%`);

        if (desde) query = query.gte('fecha', desde);
        if (hasta) query = query.lte('fecha', hasta);

        const { data: ordenes, error } = await query.order('id', { ascending: true });

        if (error) return res.status(500).send(`Error al consultar datos: ${error.message}`);

        const html = generarHTMLPresentacion(ordenes || [], marcaTarget, desde, hasta, usuarioTarget);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(500).send(`Error al generar presentación: ${err.message}`);
    }
});

// API Exportar EXCEL Avanzado con Dashboard, KPIs, Rankings y Análisis Profundo
app.get('/api/ordenes/exportar', async (req, res) => {
    const { desde, hasta, marca, usuario } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();
    const usuarioTarget = (usuario || '').toLowerCase();
    const prefijo = marcaTarget === 'incanto' ? '#INC' : '#PAN';

    const tienePermiso = await verificarPermisoInformes(marcaTarget, usuarioTarget);
    if (!tienePermiso) {
        return res.status(403).json({ error: 'Acceso restringido: No tenés permisos para exportar informes de esta marca.' });
    }

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