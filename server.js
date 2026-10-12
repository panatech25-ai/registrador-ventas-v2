require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { generarReporteVentasAvanzado } = require('./excelService');
const { generarHTMLPresentacion } = require('./reportePresentacionService');
const { generarHTMLReporteMayorista } = require('./reporteMayoristaService');
const {
    sincronizarProductosMarca,
    sincronizarProductosPanatech,
    sincronizarProductosIncanto,
    obtenerMetadataMarca,
    obtenerMetadataPanatech,
    guardarMetadataMarca,
    guardarMetadataPanatech,
    fetchAllDbProductsByBrand
} = require('./panatechScraperService');

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
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: true, mayorista: true }
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
            permisos: { nueva_orden: true, busqueda: true, stock: true, informes: true, mayorista: true }
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

// API Catálogo Completo de Productos (con imágenes, filtros y stock para Panatech e Incanto)
app.get('/api/productos/catalogo', async (req, res) => {
    const { q, marca, stock_filter, sort } = req.query;
    const marcaTarget = (marca || 'panatech').toLowerCase();

    try {
        let items = [];
        if (q && q.trim().length > 0) {
            const termino = q.trim();
            const { data, error } = await supabase
                .from('productos')
                .select('*')
                .eq('marca', marcaTarget)
                .or(`nombre.ilike.%${termino}%,codigo_sku.ilike.%${termino}%,variante.ilike.%${termino}%`)
                .limit(2000);
            if (error) throw error;
            items = data || [];
        } else {
            items = await fetchAllDbProductsByBrand(supabase, marcaTarget);
        }

        // Enriquecer con metadatos de tienda web tanto en Panatech como en Incanto
        let metadata = {};
        if (marcaTarget === 'panatech' || marcaTarget === 'incanto') {
            metadata = await obtenerMetadataMarca(supabase, marcaTarget);
        }

        let productosEnriquecidos = items.map(p => {
            const meta = metadata[p.id] || null;
            return {
                ...p,
                imagen_url: meta && meta.imagen_url ? meta.imagen_url : '/img/no-image.svg',
                url_tienda: meta ? meta.url_tienda : null,
                precio_lista: meta ? (meta.precio_lista || p.precio) : p.precio,
                precio_efectivo: p.precio,
                synced_web: !!(meta && meta.synced_web),
                es_duplicado: !!(meta && meta.es_duplicado)
            };
        });

        // Unificar productos por nombre para evitar duplicados en la vista
        const unificadosMap = new Map();
        for (const p of productosEnriquecidos) {
            const norm = (p.nombre || '').toLowerCase().trim();
            if (!unificadosMap.has(norm)) {
                unificadosMap.set(norm, p);
            } else {
                const existente = unificadosMap.get(norm);
                // Preferir el que está sincronizado con web y tiene foto, o el que tiene mayor stock
                const nuevoMejor = (p.synced_web && !existente.synced_web) || (p.stock > existente.stock && p.synced_web === existente.synced_web);
                if (nuevoMejor) {
                    unificadosMap.set(norm, p);
                }
            }
        }
        productosEnriquecidos = Array.from(unificadosMap.values());

        // Filtrado por stock
        if (stock_filter === 'con_stock') {
            productosEnriquecidos = productosEnriquecidos.filter(p => p.stock > 0);
        } else if (stock_filter === 'sin_stock') {
            productosEnriquecidos = productosEnriquecidos.filter(p => p.stock === 0);
        } else if (stock_filter === 'web') {
            productosEnriquecidos = productosEnriquecidos.filter(p => p.synced_web);
        } else if (stock_filter === 'manual') {
            productosEnriquecidos = productosEnriquecidos.filter(p => !p.synced_web);
        }

        // Ordenamiento
        if (sort === 'precio_asc') {
            productosEnriquecidos.sort((a, b) => a.precio - b.precio);
        } else if (sort === 'precio_desc') {
            productosEnriquecidos.sort((a, b) => b.precio - a.precio);
        } else if (sort === 'stock_desc') {
            productosEnriquecidos.sort((a, b) => b.stock - a.stock);
        } else if (sort === 'stock_asc') {
            productosEnriquecidos.sort((a, b) => a.stock - b.stock);
        } else {
            // Nombre A-Z por defecto
            productosEnriquecidos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        }

        res.json({
            success: true,
            productos: productosEnriquecidos,
            total: productosEnriquecidos.length,
            syncInfo: metadata._info || null
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Sincronizar catálogo desde la tienda online (Panatech o Incanto)
app.post('/api/productos/sync-web', async (req, res) => {
    const marcaTarget = ((req.body && req.body.marca) || req.query.marca || 'panatech').toLowerCase();
    try {
        const resultado = await sincronizarProductosMarca(supabase, marcaTarget);
        res.json(resultado);
    } catch (err) {
        console.error(`Error al sincronizar ${marcaTarget} con web:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Alias retrocompatible para Panatech
app.post('/api/panatech/sync-web', async (req, res) => {
    const marcaTarget = ((req.body && req.body.marca) || req.query.marca || 'panatech').toLowerCase();
    try {
        const resultado = await sincronizarProductosMarca(supabase, marcaTarget);
        res.json(resultado);
    } catch (err) {
        console.error('Error al sincronizar con web:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API Info de última sincronización
app.get('/api/panatech/sync-info', async (req, res) => {
    const marcaTarget = (req.query.marca || 'panatech').toLowerCase();
    try {
        const metadata = await obtenerMetadataMarca(supabase, marcaTarget);
        res.json({ success: true, info: metadata._info || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

        let items = data || [];
        if (marcaTarget === 'panatech' || marcaTarget === 'incanto') {
            const metadata = await obtenerMetadataMarca(supabase, marcaTarget);
            items = items.map(p => ({
                ...p,
                imagen_url: metadata[p.id]?.imagen_url || '/img/no-image.svg'
            }));
        }

        res.json(items);
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

// API Unificar dos productos (traslada historial de ventas, opcionalmente stock, y elimina el absorbido)
app.post('/api/productos/unificar', async (req, res) => {
    const { idConservar, idEliminar, sumarStock } = req.body;

    if (!idConservar || !idEliminar) {
        return res.status(400).json({ success: false, error: 'Debes especificar el producto a conservar y el producto a unificar/eliminar.' });
    }

    if (String(idConservar) === String(idEliminar)) {
        return res.status(400).json({ success: false, error: 'No puedes unificar un producto consigo mismo.' });
    }

    try {
        // 1. Obtener ambos productos
        const { data: prods, error: fetchErr } = await supabase
            .from('productos')
            .select('*')
            .in('id', [idConservar, idEliminar]);

        if (fetchErr) throw fetchErr;

        const prodConservar = prods.find(p => String(p.id) === String(idConservar));
        const prodEliminar = prods.find(p => String(p.id) === String(idEliminar));

        if (!prodConservar || !prodEliminar) {
            return res.status(404).json({ success: false, error: 'Uno o ambos productos no fueron encontrados en la base de datos.' });
        }

        // 2. Trasladar ventas históricas en orden_detalles del producto a eliminar al conservado
        const { error: reasignarErr } = await supabase
            .from('orden_detalles')
            .update({ producto_id: prodConservar.id })
            .eq('producto_id', prodEliminar.id);

        if (reasignarErr) throw reasignarErr;

        // 3. Opcionalmente sumar stock
        let nuevoStock = prodConservar.stock;
        if (sumarStock && prodEliminar.stock > 0) {
            nuevoStock = prodConservar.stock + prodEliminar.stock;
            await supabase
                .from('productos')
                .update({ stock: nuevoStock })
                .eq('id', prodConservar.id);
        }

        // 4. Trasladar metadata si el conservado no tenía y el eliminado sí
        if (prodConservar.marca === 'panatech' || prodConservar.marca === 'incanto') {
            const marcaProd = prodConservar.marca;
            const metadata = await obtenerMetadataMarca(supabase, marcaProd);
            const metaEliminado = metadata[prodEliminar.id];
            const metaConservar = metadata[prodConservar.id];

            if (metaEliminado && (!metaConservar || !metaConservar.synced_web)) {
                metadata[prodConservar.id] = {
                    ...metaEliminado,
                    synced_web: metaEliminado.synced_web,
                    ultima_sync: new Date().toISOString()
                };
            }
            delete metadata[prodEliminar.id];
            await guardarMetadataMarca(supabase, metadata, marcaProd);
        }

        // 5. Eliminar el producto absorbido de la tabla productos (sus órdenes ya fueron migradas)
        const { error: deleteErr } = await supabase
            .from('productos')
            .delete()
            .eq('id', prodEliminar.id);

        if (deleteErr) {
            console.warn('No se pudo borrar físicamente el producto unificado, dejándolo en stock 0:', deleteErr.message);
            await supabase.from('productos').update({ stock: 0 }).eq('id', prodEliminar.id);
        }

        res.json({
            success: true,
            mensaje: `¡Productos unificados con éxito! El historial de "${prodEliminar.nombre}" fue trasladado a "${prodConservar.nombre}".`,
            productoConservado: {
                ...prodConservar,
                stock: nuevoStock
            }
        });
    } catch (err) {
        console.error('Error al unificar productos:', err);
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

// Listar productos de Stock Mayorista enriquecidos con fotos de Incanto
app.get('/api/mayorista/productos', async (req, res) => {
    try {
        const [{ data, error }, metadataIncanto, prodsIncanto] = await Promise.all([
            supabase
                .from('productos')
                .select('*')
                .eq('marca', 'incanto_mayorista')
                .order('nombre', { ascending: true }),
            obtenerMetadataMarca(supabase, 'incanto'),
            fetchAllDbProductsByBrand(supabase, 'incanto')
        ]);

        if (error) throw error;

        // Mapa de nombre normalizado -> imagen_url de Incanto para enriquecer visualmente el stock mayorista
        const imgPorNombre = new Map();
        for (const pi of (prodsIncanto || [])) {
            const meta = metadataIncanto[pi.id];
            if (meta && meta.imagen_url && meta.imagen_url !== '/img/no-image.svg') {
                imgPorNombre.set((pi.nombre || '').toLowerCase().trim(), meta.imagen_url);
            }
        }

        const enriquecidos = (data || []).map(p => ({
            ...p,
            imagen_url: imgPorNombre.get((p.nombre || '').toLowerCase().trim()) || '/img/no-image.svg'
        }));

        res.json(enriquecidos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catálogo base de productos de Incanto para sugerir al cargar Compras Mayoristas
app.get('/api/mayorista/catalogo-origen', async (req, res) => {
    try {
        const [prodsIncanto, prodsMayorista, metadataIncanto] = await Promise.all([
            fetchAllDbProductsByBrand(supabase, 'incanto'),
            supabase.from('productos').select('*').eq('marca', 'incanto_mayorista'),
            obtenerMetadataMarca(supabase, 'incanto')
        ]);

        const stockMayPorNombre = new Map();
        for (const pm of (prodsMayorista.data || [])) {
            stockMayPorNombre.set((pm.nombre || '').toLowerCase().trim(), pm);
        }

        const mapUnicos = new Map();
        for (const p of (prodsIncanto || [])) {
            const norm = (p.nombre || '').toLowerCase().trim();
            if (!norm) continue;
            const meta = metadataIncanto[p.id] || null;
            const pmExist = stockMayPorNombre.get(norm);
            const item = {
                incanto_id: p.id,
                mayorista_id: pmExist ? pmExist.id : null,
                nombre: p.nombre,
                codigo_sku: p.codigo_sku,
                variante: p.variante || 'Mayorista',
                precio_referencia: pmExist && pmExist.precio > 0 ? pmExist.precio : (p.precio || 0),
                stock_mayorista: pmExist ? (parseInt(pmExist.stock) || 0) : 0,
                imagen_url: meta && meta.imagen_url ? meta.imagen_url : '/img/no-image.svg'
            };

            if (!mapUnicos.has(norm) || (item.imagen_url !== '/img/no-image.svg' && mapUnicos.get(norm).imagen_url === '/img/no-image.svg')) {
                mapUnicos.set(norm, item);
            }
        }

        // También incluir cualquier producto que esté en incanto_mayorista pero no en incanto
        for (const pm of (prodsMayorista.data || [])) {
            const norm = (pm.nombre || '').toLowerCase().trim();
            if (norm && !mapUnicos.has(norm)) {
                mapUnicos.set(norm, {
                    incanto_id: null,
                    mayorista_id: pm.id,
                    nombre: pm.nombre,
                    codigo_sku: pm.codigo_sku,
                    variante: pm.variante || 'Mayorista',
                    precio_referencia: pm.precio || 0,
                    stock_mayorista: parseInt(pm.stock) || 0,
                    imagen_url: '/img/no-image.svg'
                });
            }
        }

        const resultado = Array.from(mapUnicos.values()).sort((a, b) =>
            a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        );

        res.json(resultado);
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
            const { data, error } = await supabase
                .from('productos')
                .update({
                    nombre: nombre.trim(),
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
            const codigo_sku = `MAY-${Date.now().toString().slice(-6)}`;
            const { data, error } = await supabase
                .from('productos')
                .insert([{
                    codigo_sku,
                    nombre: nombre.trim(),
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

// Eliminar un producto directamente del Stock Mayorista
app.delete('/api/mayorista/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('productos')
            .delete()
            .eq('id', id)
            .eq('marca', 'incanto_mayorista');
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper para parsear una orden mayorista (soporta formato de 1 ítem o multi-ítems)
function parsearOrdenMayorista(t) {
    let detalleJson = null;
    try {
        detalleJson = t.observaciones ? JSON.parse(t.observaciones) : null;
    } catch (e) {
        detalleJson = { texto: t.observaciones };
    }

    const esVenta = (t.numero_orden || '').includes('VTA');
    let items = [];

    if (detalleJson && Array.isArray(detalleJson.items) && detalleJson.items.length > 0) {
        items = detalleJson.items.map(it => {
            const cant = parseInt(it.cantidad) || 1;
            const unit = parseFloat(it.precio_unitario) || 0;
            const sub = parseFloat(it.subtotal) || (cant * unit);
            return {
                producto_id: it.producto_id || null,
                producto_nombre: it.producto_nombre || 'Producto',
                cantidad: cant,
                precio_unitario: unit,
                subtotal: sub
            };
        });
    } else if (detalleJson && detalleJson.producto_nombre) {
        const cant = parseInt(detalleJson.cantidad) || 1;
        const unit = parseFloat(detalleJson.precio_unitario) || ((parseFloat(t.total) || 0) / cant);
        items = [{
            producto_id: detalleJson.producto_id || null,
            producto_nombre: detalleJson.producto_nombre,
            cantidad: cant,
            precio_unitario: unit,
            subtotal: parseFloat(t.total) || (cant * unit)
        }];
    }

    const cantidadTotal = items.reduce((acc, it) => acc + (parseInt(it.cantidad) || 0), 0) || 1;
    const resumenProductos = items.length > 0
        ? items.map(it => `${it.producto_nombre} (x${it.cantidad})`).join(', ')
        : 'Producto';

    return {
        id: t.id,
        numero: t.numero_orden,
        tipo: esVenta ? 'venta' : 'compra',
        fecha: t.fecha,
        persona: t.cliente_nombre,
        items,
        producto: items.length === 1 ? items[0].producto_nombre : resumenProductos,
        cantidad: cantidadTotal,
        precio_unitario: items.length === 1 ? items[0].precio_unitario : ((parseFloat(t.total) || 0) / cantidadTotal),
        total: parseFloat(t.total) || 0,
        estado: t.estado,
        vendedor: t.vendedor
    };
}

// Helper para buscar o crear producto en Stock Mayorista (`incanto_mayorista`)
async function obtenerOCrearProductoMayorista({ producto_id, producto_nombre, precio_unitario }) {
    let prodTarget = null;
    const nombreLimpio = (producto_nombre || '').trim();

    if (producto_id) {
        const { data: p } = await supabase
            .from('productos')
            .select('*')
            .eq('id', producto_id)
            .eq('marca', 'incanto_mayorista')
            .maybeSingle();
        prodTarget = p;
    }

    if (!prodTarget && nombreLimpio) {
        const { data: pExist } = await supabase
            .from('productos')
            .select('*')
            .eq('marca', 'incanto_mayorista')
            .ilike('nombre', nombreLimpio)
            .maybeSingle();
        if (pExist) prodTarget = pExist;
    }

    if (!prodTarget) {
        const codigo_sku = `MAY-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`;
        const { data: pNew, error: pErr } = await supabase
            .from('productos')
            .insert([{
                codigo_sku,
                nombre: nombreLimpio || 'Producto Mayorista',
                variante: 'Mayorista',
                precio: parseFloat(precio_unitario) || 0,
                stock: 0,
                marca: 'incanto_mayorista'
            }])
            .select()
            .single();
        if (pErr) throw pErr;
        prodTarget = pNew;
    }

    return prodTarget;
}

// Helper para revertir el impacto de stock de una transacción mayorista previa (antes de editar o eliminar)
async function revertirStockTransaccionMayorista(transaccionParseada) {
    const esVenta = transaccionParseada.tipo === 'venta';
    for (const item of (transaccionParseada.items || [])) {
        const cant = parseInt(item.cantidad) || 0;
        if (cant <= 0) continue;

        let prod = null;
        if (item.producto_id) {
            const { data } = await supabase
                .from('productos')
                .select('*')
                .eq('id', item.producto_id)
                .eq('marca', 'incanto_mayorista')
                .maybeSingle();
            prod = data;
        }
        if (!prod && item.producto_nombre) {
            const { data } = await supabase
                .from('productos')
                .select('*')
                .eq('marca', 'incanto_mayorista')
                .ilike('nombre', item.producto_nombre.trim())
                .maybeSingle();
            prod = data;
        }

        if (prod) {
            // Si era una venta, al revertirla devolvemos (sumamos) el stock.
            // Si era una compra, al revertirla restamos el stock que había sumado.
            const stockActual = parseInt(prod.stock) || 0;
            const nuevoStock = esVenta
                ? (stockActual + cant)
                : Math.max(0, stockActual - cant);

            await supabase
                .from('productos')
                .update({ stock: nuevoStock })
                .eq('id', prod.id);
        }
    }
}

// Helper para aplicar el impacto de stock de una lista de ítems (en creación o edición)
async function aplicarStockItemsMayorista(tipo, rawItems) {
    const esVenta = tipo === 'venta';
    const itemsProcesados = [];
    let importeTotal = 0;

    for (const it of rawItems) {
        const cant = Math.max(1, parseInt(it.cantidad) || 1);
        const unit = parseFloat(it.precio_unitario) || ((parseFloat(it.subtotal) || 0) / cant) || 0;
        const sub = parseFloat(it.subtotal) || (cant * unit);
        const nombreProd = (it.producto_nombre || '').trim();
        if (!nombreProd) continue;

        const prodTarget = await obtenerOCrearProductoMayorista({
            producto_id: it.producto_id,
            producto_nombre: nombreProd,
            precio_unitario: unit
        });

        const stockActual = parseInt(prodTarget.stock) || 0;
        const nuevoStock = esVenta
            ? Math.max(0, stockActual - cant)
            : (stockActual + cant);

        const updateFields = { stock: nuevoStock };
        // Si es compra y trae costo/precio unitario > 0, actualizamos el precio de referencia en stock mayorista
        if (!esVenta && unit > 0) {
            updateFields.precio = unit;
        }

        await supabase
            .from('productos')
            .update(updateFields)
            .eq('id', prodTarget.id);

        itemsProcesados.push({
            producto_id: prodTarget.id,
            producto_nombre: prodTarget.nombre,
            cantidad: cant,
            precio_unitario: unit,
            subtotal: sub
        });

        importeTotal += sub;
    }

    return { itemsProcesados, importeTotal };
}

// Listar transacciones recientes (Ventas y Compras)
app.get('/api/mayorista/transacciones', async (req, res) => {
    const { tipo, limite } = req.query;
    const limitNum = parseInt(limite) || 50;

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

        const transacciones = (data || []).map(parsearOrdenMayorista);
        res.json(transacciones);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar Venta Mayorista (Soporta múltiples productos o 1 producto, descontando de Stock Mayorista)
app.post('/api/mayorista/ventas', async (req, res) => {
    const { cliente, items, producto_id, producto_nombre, cantidad, precio_unitario, importe, vendedor } = req.body;
    const clienteLimpio = (cliente || '').trim();

    let listaItems = Array.isArray(items) && items.length > 0 ? items : [];
    if (listaItems.length === 0 && producto_nombre) {
        const cant = parseInt(cantidad) || 1;
        const tot = parseFloat(importe) || 0;
        const unit = parseFloat(precio_unitario) || (tot / cant);
        listaItems = [{
            producto_id,
            producto_nombre,
            cantidad: cant,
            precio_unitario: unit,
            subtotal: tot || (cant * unit)
        }];
    }

    if (!clienteLimpio || listaItems.length === 0) {
        return res.status(400).json({ error: 'Debés indicar el Cliente y al menos un producto para la venta.' });
    }

    try {
        const { itemsProcesados, importeTotal } = await aplicarStockItemsMayorista('venta', listaItems);

        if (itemsProcesados.length === 0) {
            return res.status(400).json({ error: 'No se encontraron productos válidos en la venta.' });
        }

        const numVenta = `#INC-MAY-VTA-${Date.now().toString().slice(-6)}`;
        const fechaHoy = new Date().toISOString().split('T')[0];

        const detalleObj = {
            tipo: 'venta_mayorista',
            items: itemsProcesados,
            producto_id: itemsProcesados[0].producto_id,
            producto_nombre: itemsProcesados.map(i => `${i.producto_nombre} (x${i.cantidad})`).join(', '),
            cantidad: itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0),
            precio_unitario: itemsProcesados.length === 1 ? itemsProcesados[0].precio_unitario : (importeTotal / itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0))
        };

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden: numVenta,
                fecha: fechaHoy,
                vendedor: vendedor || 'sistema',
                cliente_nombre: clienteLimpio,
                total: importeTotal,
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
            orden: parsearOrdenMayorista(orden)
        });
    } catch (err) {
        console.error('Error al registrar venta mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Registrar Compra Mayorista (Soporta múltiples productos al proveedor, suma al Stock Mayorista)
app.post('/api/mayorista/compras', async (req, res) => {
    const { proveedor, items, producto_id, producto_nombre, cantidad, precio_unitario, importe, vendedor } = req.body;
    const proveedorLimpio = (proveedor || '').trim();

    let listaItems = Array.isArray(items) && items.length > 0 ? items : [];
    if (listaItems.length === 0 && producto_nombre) {
        const cant = parseInt(cantidad) || 1;
        const tot = parseFloat(importe) || 0;
        const unit = parseFloat(precio_unitario) || (tot / cant);
        listaItems = [{
            producto_id,
            producto_nombre,
            cantidad: cant,
            precio_unitario: unit,
            subtotal: tot || (cant * unit)
        }];
    }

    if (!proveedorLimpio || listaItems.length === 0) {
        return res.status(400).json({ error: 'Debés indicar el Proveedor y al menos un producto para la compra.' });
    }

    try {
        const { itemsProcesados, importeTotal } = await aplicarStockItemsMayorista('compra', listaItems);

        if (itemsProcesados.length === 0) {
            return res.status(400).json({ error: 'No se encontraron productos válidos en la compra.' });
        }

        const numCompra = `#INC-MAY-CMP-${Date.now().toString().slice(-6)}`;
        const fechaHoy = new Date().toISOString().split('T')[0];

        const detalleObj = {
            tipo: 'compra_mayorista',
            items: itemsProcesados,
            producto_id: itemsProcesados[0].producto_id,
            producto_nombre: itemsProcesados.map(i => `${i.producto_nombre} (x${i.cantidad})`).join(', '),
            cantidad: itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0),
            precio_unitario: itemsProcesados.length === 1 ? itemsProcesados[0].precio_unitario : (importeTotal / itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0))
        };

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes')
            .insert([{
                numero_orden: numCompra,
                fecha: fechaHoy,
                vendedor: vendedor || 'sistema',
                cliente_nombre: proveedorLimpio,
                total: importeTotal,
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
            orden: parsearOrdenMayorista(orden)
        });
    } catch (err) {
        console.error('Error al registrar compra mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Editar una Compra o Venta Mayorista existente (revierte el impacto anterior en Stock Mayorista y aplica el nuevo)
app.put('/api/mayorista/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    const { persona, items, vendedor } = req.body;
    const personaLimpia = (persona || '').trim();

    if (!personaLimpia || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Debés indicar el Cliente/Proveedor y al menos un producto.' });
    }

    try {
        const { data: ordenActual, error: errFetch } = await supabase
            .from('ordenes')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (errFetch) throw errFetch;
        if (!ordenActual) {
            return res.status(404).json({ error: 'Transacción no encontrada.' });
        }

        const transaccionPrevia = parsearOrdenMayorista(ordenActual);

        // 1. Revertir el stock anterior
        await revertirStockTransaccionMayorista(transaccionPrevia);

        // 2. Aplicar el nuevo stock
        const { itemsProcesados, importeTotal } = await aplicarStockItemsMayorista(transaccionPrevia.tipo, items);

        const detalleObj = {
            tipo: transaccionPrevia.tipo === 'venta' ? 'venta_mayorista' : 'compra_mayorista',
            items: itemsProcesados,
            producto_id: itemsProcesados[0]?.producto_id || null,
            producto_nombre: itemsProcesados.map(i => `${i.producto_nombre} (x${i.cantidad})`).join(', '),
            cantidad: itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0),
            precio_unitario: itemsProcesados.length === 1 ? itemsProcesados[0].precio_unitario : (importeTotal / (itemsProcesados.reduce((acc, i) => acc + i.cantidad, 0) || 1))
        };

        const { data: ordenActualizada, error: errUpd } = await supabase
            .from('ordenes')
            .update({
                cliente_nombre: personaLimpia,
                total: importeTotal,
                vendedor: vendedor || ordenActual.vendedor || 'sistema',
                observaciones: JSON.stringify(detalleObj)
            })
            .eq('id', id)
            .select()
            .single();

        if (errUpd) throw errUpd;

        res.json({
            success: true,
            orden: parsearOrdenMayorista(ordenActualizada)
        });
    } catch (err) {
        console.error('Error al editar transacción mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Eliminar una Compra o Venta Mayorista (revierte automáticamente el stock en Stock Mayorista)
app.delete('/api/mayorista/transacciones/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { data: ordenActual, error: errFetch } = await supabase
            .from('ordenes')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (errFetch) throw errFetch;
        if (!ordenActual) {
            return res.status(404).json({ error: 'Transacción no encontrada.' });
        }

        const transaccionPrevia = parsearOrdenMayorista(ordenActual);

        // 1. Revertir el stock de la compra o venta
        await revertirStockTransaccionMayorista(transaccionPrevia);

        // 2. Eliminar la orden
        const { error: errDel } = await supabase
            .from('ordenes')
            .delete()
            .eq('id', id);

        if (errDel) throw errDel;

        res.json({
            success: true,
            mensaje: `${transaccionPrevia.tipo === 'venta' ? 'Venta' : 'Compra'} eliminada y stock actualizado.`
        });
    } catch (err) {
        console.error('Error al eliminar transacción mayorista:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para Informe Ejecutivo en PDF / Pantalla de Incanto Mayorista
app.get('/reporte-mayorista', async (req, res) => {
    const { desde, hasta, usuario } = req.query;

    try {
        // 1. Obtener transacciones mayoristas filtradas por fecha
        let queryTrans = supabase
            .from('ordenes')
            .select('*')
            .ilike('numero_orden', '#INC-MAY-%')
            .order('id', { ascending: false });

        if (desde) queryTrans = queryTrans.gte('fecha', desde);
        if (hasta) queryTrans = queryTrans.lte('fecha', hasta);

        const { data: rawTrans, error: errTrans } = await queryTrans;
        if (errTrans) throw errTrans;

        const transacciones = (rawTrans || []).map(parsearOrdenMayorista);

        // 2. Obtener productos de stock mayorista
        const { data: productos, error: errProds } = await supabase
            .from('productos')
            .select('*')
            .eq('marca', 'incanto_mayorista');

        if (errProds) throw errProds;

        // 3. Obtener cotización MEP
        let cotizacionMep = 1540;
        if (dolarMepCache && dolarMepCache.venta) {
            cotizacionMep = dolarMepCache.venta;
        } else {
            try {
                const respMep = await fetch('https://dolarapi.com/v1/dolares/bolsa');
                if (respMep.ok) {
                    const dataMep = await respMep.json();
                    cotizacionMep = parseFloat(dataMep.venta) || 1540;
                }
            } catch (e) {}
        }

        const html = generarHTMLReporteMayorista({
            transacciones,
            productos: productos || [],
            cotizacionMep,
            desde,
            hasta,
            usuario: usuario || 'sistema'
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(500).send(`Error al generar reporte de Incanto Mayorista: ${err.message}`);
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
                    informes: !!(usuario.incanto?.permisos?.informes),
                    mayorista: !!(usuario.incanto?.permisos?.mayorista)
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