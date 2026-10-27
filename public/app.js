let carrito = [];
let params = new URLSearchParams(window.location.search);
if (!params.get('marca')) {
    window.location.href = '/';
}
let MARCA_ACTUAL = (params.get('marca') || '').toLowerCase();
// USUARIO_ACTUAL se carga desde el JWT via /api/me (no desde la URL)
let USUARIO_ACTUAL = 'cargando...';
let ultimasOrdenesMemoria = [];
let html5QrCodeScanner = null;
let ultimaOrdenGuardada = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Primero verificar sesión JWT — redirigir al login si no hay token válido
    try {
        const meRes = await fetch('/api/me');
        if (!meRes.ok) {
            // Sin sesión válida → redirigir al login de la marca
            window.location.href = `/login/${MARCA_ACTUAL}`;
            return;
        }
        const meData = await meRes.json();
        USUARIO_ACTUAL = meData.username || 'vendedor';
        ES_ADMIN = !!meData.esAdmin;
        PERMISOS_ACTUALES = meData.permisos || {};

        // Si el JWT es de otra marca, redirigir al login correcto
        if (meData.marca && meData.marca !== MARCA_ACTUAL) {
            window.location.href = `/login/${MARCA_ACTUAL}`;
            return;
        }
    } catch (err) {
        window.location.href = `/login/${MARCA_ACTUAL}`;
        return;
    }

    configurarMarcaUI();
    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('vendedor').value = USUARIO_ACTUAL;
    cargarUltimasOrdenes();
    cargarMetricasHoy();
    actualizarColorEstado('Iniciado');

    // Inicializar fechas por defecto del modal de exportación
    const hoyStr = new Date().toISOString().split('T')[0];
    const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    if (document.getElementById('exportFechaInicio')) document.getElementById('exportFechaInicio').value = primerDiaMes;
    if (document.getElementById('exportFechaFin')) document.getElementById('exportFechaFin').value = hoyStr;
});

// ==========================================
// SISTEMA DE NOTIFICACIONES TOAST (Reemplaza alert)
// ==========================================
function showToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-2.5 p-3 rounded-xl shadow-2xl text-xs font-semibold text-white border toast-animate-in';

    let icon = '✅';
    let bgBorder = 'bg-slate-900/95 border-emerald-500/80 text-emerald-300';

    if (tipo === 'error') {
        icon = '❌';
        bgBorder = 'bg-slate-900/95 border-rose-500/80 text-rose-300';
    } else if (tipo === 'warning') {
        icon = '⚠️';
        bgBorder = 'bg-slate-900/95 border-amber-500/80 text-amber-300';
    } else if (tipo === 'info') {
        icon = 'ℹ️';
        bgBorder = 'bg-slate-900/95 border-sky-500/80 text-sky-300';
    }

    toast.className += ` ${bgBorder}`;
    toast.innerHTML = `
        <span class="text-base">${icon}</span>
        <span class="flex-1">${mensaje}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('toast-animate-in');
        toast.classList.add('toast-animate-out');
        setTimeout(() => toast.remove(), 220);
    }, 3200);
}

// ==========================================
// Almacenamiento local de permisos del usuario actual
let PERMISOS_ACTUALES = {
    nueva_orden: false,
    busqueda: false,
    stock: false,
    informes: false,
    mayorista: false
};
let ES_ADMIN = false;

// ==========================================
// CONFIGURACIÓN DE MARCA Y PERMISOS UI
// ==========================================
async function configurarMarcaUI() {
    const esIncanto = MARCA_ACTUAL === 'incanto';
    const logoImg = document.getElementById('brandLogo');
    const title = document.getElementById('brandTitle');
    const submitBtn = document.getElementById('submitBtn');
    const buscarBtn = document.getElementById('buscarBtn');
    const panelTitle = document.getElementById('panelUltimosTitle');
    const agregarLabel = document.getElementById('agregarProdLabel');

    const logoImgMob = document.getElementById('brandLogoMobile');
    const titleMob = document.getElementById('brandTitleMobile');

    if (esIncanto) {
        if (logoImg) logoImg.src = '/logos/incanto.png';
        if (logoImgMob) logoImgMob.src = '/logos/incanto.png';
        if (title) {
            title.textContent = 'INCANTO';
            title.className = 'text-xl font-black tracking-wider text-rose-500 leading-tight truncate';
        }
        if (titleMob) {
            titleMob.textContent = 'INCANTO';
            titleMob.className = 'md:hidden text-base font-black tracking-wider text-rose-500 leading-none';
        }
        if (submitBtn) submitBtn.className = 'flex-1 sm:flex-none bg-rose-600 hover:bg-rose-500 font-bold py-2.5 px-6 rounded-lg text-white shadow-lg transition text-center text-xs';
        if (buscarBtn) buscarBtn.className = 'bg-rose-600 hover:bg-rose-500 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition shadow';
        if (panelTitle) panelTitle.className = 'text-xs font-bold tracking-wider text-rose-400 uppercase';
        if (agregarLabel) agregarLabel.className = 'block text-xs font-semibold text-rose-400 uppercase tracking-wider';
    } else {
        if (logoImg) logoImg.src = '/logos/panatech.png';
        if (logoImgMob) logoImgMob.src = '/logos/panatech.png';
        if (title) {
            title.textContent = 'PANATECH';
            title.className = 'text-xl font-black tracking-wider text-sky-400 leading-tight truncate';
        }
        if (titleMob) {
            titleMob.textContent = 'PANATECH';
            titleMob.className = 'md:hidden text-base font-black tracking-wider text-sky-400 leading-none';
        }
    }

    // Cargar permisos del servidor para este usuario y marca
    await cargarPermisosUsuario();
}

async function cargarPermisosUsuario() {
    try {
        // Los permisos vienen del JWT — el backend los devuelve sin necesitar ?usuario=
        const res = await fetch(`/api/permisos/mis-permisos`);
        if (res.ok) {
            const data = await res.json();
            PERMISOS_ACTUALES = data.permisos || {};
            ES_ADMIN = !!data.esAdmin;
            USUARIO_ACTUAL = data.username || USUARIO_ACTUAL;
        } else if (ES_ADMIN) {
            PERMISOS_ACTUALES = { nueva_orden: true, busqueda: true, stock: true, informes: true };
        }
    } catch (err) {
        console.error('Error al cargar permisos:', err);
        if (ES_ADMIN) {
            PERMISOS_ACTUALES = { nueva_orden: true, busqueda: true, stock: true, informes: true };
        }
    }

    aplicarPermisosEnUI();

    // Mostrar nombre de usuario en el sidebar
    const labelUsuario = document.getElementById('sideNavUsuarioLabel');
    if (labelUsuario) labelUsuario.textContent = USUARIO_ACTUAL;
}

// ── Cerrar sesión ────────────────────────────────────────────────────────────
async function cerrarSesion() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (_) {}
    window.location.href = `/login/${MARCA_ACTUAL}`;
}

function aplicarPermisosEnUI() {
    const puedeNueva = ES_ADMIN || !!PERMISOS_ACTUALES.nueva_orden;
    const puedeBusqueda = ES_ADMIN || !!PERMISOS_ACTUALES.busqueda;
    const puedeStock = ES_ADMIN || !!PERMISOS_ACTUALES.stock;
    const puedeInformes = ES_ADMIN || !!PERMISOS_ACTUALES.informes;

    const esIncanto = MARCA_ACTUAL === 'incanto';
    const puedeMayorista = esIncanto && (ES_ADMIN || !!PERMISOS_ACTUALES.mayorista);

    // 1. Botón de Nueva Orden
    const sideNavNueva = document.getElementById('sideNavNueva');
    const bottomNavNueva = document.getElementById('bottomNavNueva');
    if (sideNavNueva) sideNavNueva.style.display = puedeNueva ? 'flex' : 'none';
    if (bottomNavNueva) bottomNavNueva.style.display = puedeNueva ? 'flex' : 'none';

    // 2. Botón de Búsqueda
    const sideNavBusqueda = document.getElementById('sideNavBusqueda');
    const bottomNavBusqueda = document.getElementById('bottomNavBusqueda');
    if (sideNavBusqueda) sideNavBusqueda.style.display = puedeBusqueda ? 'flex' : 'none';
    if (bottomNavBusqueda) bottomNavBusqueda.style.display = puedeBusqueda ? 'flex' : 'none';

    // 3. Botón de Stock / Precios
    const sideStockBtn = document.getElementById('sideNavStock') || document.querySelector('aside button[onclick*="abrirModalStock"]');
    const bottomStockBtn = document.getElementById('bottomNavStock') || document.querySelector('nav button[onclick*="abrirModalStock"]');
    if (sideStockBtn) sideStockBtn.style.display = puedeStock ? 'flex' : 'none';
    if (bottomStockBtn) bottomStockBtn.style.display = puedeStock ? 'flex' : 'none';

    // 4. Botón de Informes
    const btnInformes = document.getElementById('btnMenuInformes');
    const bottomNavInformes = document.getElementById('bottomNavInformes');
    if (btnInformes) {
        if (puedeInformes) btnInformes.classList.remove('hidden');
        else btnInformes.classList.add('hidden');
    }
    if (bottomNavInformes) {
        if (puedeInformes) bottomNavInformes.classList.remove('hidden');
        else bottomNavInformes.classList.add('hidden');
    }

    // 5. Botón de Menú Usuarios (SOLO para npanadisi)
    const btnMenuUsuarios = document.getElementById('btnMenuUsuarios');
    const bottomNavUsuarios = document.getElementById('bottomNavUsuarios');
    if (btnMenuUsuarios) {
        if (ES_ADMIN) btnMenuUsuarios.classList.remove('hidden');
        else btnMenuUsuarios.classList.add('hidden');
    }
    if (bottomNavUsuarios) {
        if (ES_ADMIN) bottomNavUsuarios.classList.remove('hidden');
        else bottomNavUsuarios.classList.add('hidden');
    }

    // 6. Botón Incanto Mayorista (SOLO para Incanto y si tiene permiso o es admin)
    const sideNavMayorista = document.getElementById('sideNavMayorista');
    const bottomNavMayorista = document.getElementById('bottomNavMayorista');
    if (sideNavMayorista) {
        sideNavMayorista.style.display = puedeMayorista ? 'flex' : 'none';
        if (puedeMayorista) sideNavMayorista.classList.remove('hidden');
        else sideNavMayorista.classList.add('hidden');
    }
    if (bottomNavMayorista) {
        bottomNavMayorista.style.display = puedeMayorista ? 'flex' : 'none';
        if (puedeMayorista) bottomNavMayorista.classList.remove('hidden');
        else bottomNavMayorista.classList.add('hidden');
    }

    // Lógica de redirección de sección inicial según permisos:
    if (!puedeNueva && SECCION_ACTUAL === 'nueva') {
        if (puedeMayorista) {
            cambiarSeccion('mayorista');
        } else if (puedeBusqueda) {
            cambiarSeccion('busqueda');
        } else if (puedeStock) {
            cambiarSeccion('stock');
        } else if (puedeInformes) {
            cambiarSeccion('informes');
        }
    }
}

function usuarioTienePermisoInformes() {
    return ES_ADMIN || !!PERMISOS_ACTUALES.informes;
}

// ==========================================
// MINI-DASHBOARD DE MÉTRICAS DIARIAS
// ==========================================
async function cargarMetricasHoy() {
    try {
        const res = await fetch(`/api/metricas/hoy?marca=${MARCA_ACTUAL}`);
        const data = await res.json();

        const elVentas = document.getElementById('kpiVentasHoy');
        const elOrdenes = document.getElementById('kpiOrdenesHoy');
        const elEnvios = document.getElementById('kpiEnviosPendientes');

        if (elVentas) elVentas.textContent = `$${(parseFloat(data.totalVentas) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (elOrdenes) elOrdenes.textContent = data.cantOrdenes || 0;
        if (elEnvios) elEnvios.textContent = data.enviosPendientes || 0;
    } catch (err) {
        console.error('Error al cargar métricas del día:', err);
    }
}

// ==========================================
// UTILIDADES (Debounce & Formateo)
// ==========================================
function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function actualizarColorEstado(valor) {
    const select = document.getElementById('estado_pedido');
    if (!select) return;

    select.className = "w-full rounded-lg p-2 text-xs font-bold focus:outline-none transition-colors border ";
    
    if (valor === 'Iniciado') {
        select.className += "bg-amber-950/80 border-amber-700 text-amber-300";
    } else if (valor === 'Abonado') {
        select.className += "bg-blue-950/80 border-blue-700 text-blue-300";
    } else if (valor === 'Preparado') {
        select.className += "bg-purple-950/80 border-purple-700 text-purple-300";
    } else if (valor === 'Finalizado') {
        select.className += "bg-emerald-950/80 border-emerald-700 text-emerald-300";
    } else if (valor === 'Cancelado') {
        select.className += "bg-rose-950/80 border-rose-700 text-rose-300";
    }
}

function toggleEnvioFields() {
    const modo = document.getElementById('modo_entrega').value;
    const envioFields = document.getElementById('envioFields');
    if (modo === 'Envio') {
        envioFields.classList.remove('hidden');
    } else {
        envioFields.classList.add('hidden');
        document.getElementById('costo_envio').value = 0;
        const chkP = document.getElementById('chk_prod_abonado');
        const chkT = document.getElementById('chk_abonado_total');
        if (chkP) chkP.checked = false;
        if (chkT) chkT.checked = false;
        calcularTotal();
    }
}

function seleccionarPagoEnvio(idSeleccionado) {
    const chkProd = document.getElementById('chk_prod_abonado');
    const chkTotal = document.getElementById('chk_abonado_total');

    if (idSeleccionado === 'chk_prod_abonado' && chkProd.checked) {
        chkTotal.checked = false;
    } else if (idSeleccionado === 'chk_abonado_total' && chkTotal.checked) {
        chkProd.checked = false;
        const estSelect = document.getElementById('estado_pedido');
        if (estSelect && estSelect.value === 'Iniciado') {
            estSelect.value = 'Abonado';
            actualizarColorEstado('Abonado');
        }
    }
}

function formatearFechaVista(fechaRaw) {
    if (!fechaRaw) return 'S/D';
    const fechaLimpia = fechaRaw.split('T')[0];
    const partes = fechaLimpia.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaLimpia;
}

// ==========================================
// WHATSAPP CLIENTE & CADETE
// ==========================================
function abrirWhatsAppCliente() {
    const rawTel = document.getElementById('cliente_telefono').value;
    if (!rawTel || rawTel.trim() === '') {
        showToast('Ingresá un número de teléfono primero.', 'warning');
        return;
    }

    let numLimpio = rawTel.replace(/\D/g, '');
    if (!numLimpio.startsWith('54')) {
        numLimpio = '54' + numLimpio;
    }

    window.open(`https://wa.me/${numLimpio}`, '_blank');
}

function enviarWhatsappCadete() {
    const cliente = document.getElementById('cliente_nombre').value || 'Sin especificar';
    const direccion = document.getElementById('direccion_envio').value || 'Sin especificar';
    const horario = document.getElementById('horario_envio').value || 'Sin especificar';
    const telefono = document.getElementById('cliente_telefono').value || 'Sin especificar';
    const metodoPago = document.getElementById('metodo_pago').value || 'Sin especificar';
    const observaciones = document.getElementById('observaciones').value || 'Sin observaciones';
    
    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const costoEnvio = parseFloat(document.getElementById('costo_envio').value) || 0;
    const totalPedido = subtotal + costoEnvio;

    let estadoPagoTexto = "";
    const chkTotal = document.getElementById('chk_abonado_total');
    const chkProd = document.getElementById('chk_prod_abonado');

    if (chkTotal && chkTotal.checked) {
        estadoPagoTexto = " (ABONADO EL TOTAL)";
    } else if (chkProd && chkProd.checked) {
        estadoPagoTexto = " (PRODUCTO ABONADO, COBRAR SOLO ENVÍO)";
    }

    const mensaje = `🛵 *--- Nuevo envio ---*\n` +
                    `👤 *Nombre Cliente:* ${cliente}\n` +
                    `📍 *Direccion Envio:* ${direccion}\n` +
                    `🕒 *Horario:* ${horario}\n` +
                    `📞 *Telefono Cliente:* ${telefono}\n` +
                    `💳 *Metodo de Pago:* ${metodoPago}${estadoPagoTexto}\n` +
                    `📝 *Observaciones:* ${observaciones}\n` +
                    `💰 *TOTAL PEDIDO:* $${totalPedido.toFixed(2)} ($${costoEnvio.toFixed(2)} Costo Envio)`;

    const cadeteInput = document.getElementById('cadete').value.trim();
    let numCadeteLimpio = cadeteInput.replace(/\D/g, '');

    if (numCadeteLimpio.length >= 8) {
        if (!numCadeteLimpio.startsWith('54')) {
            numCadeteLimpio = '54' + numCadeteLimpio;
        }
        window.open(`https://wa.me/${numCadeteLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
    } else {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensaje)}`, '_blank');
    }
}

// ==========================================
// BÚSQUEDA DE PRODUCTOS CON DEBOUNCE Y STOCK
// ==========================================
let PRODUCTOS_BUSQUEDA_ACTUAL = [];
const onProdSearchInput = debounce((val) => buscarProductos(val), 250);

async function buscarProductos(query) {
    const resDiv = document.getElementById('prodResults');
    if (!query || query.trim().length === 0) {
        resDiv.classList.add('hidden');
        return;
    }

    try {
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(query)}&marca=${MARCA_ACTUAL}`);
        const productos = await res.json();
        PRODUCTOS_BUSQUEDA_ACTUAL = Array.isArray(productos) ? productos : [];

        if (!PRODUCTOS_BUSQUEDA_ACTUAL || PRODUCTOS_BUSQUEDA_ACTUAL.length === 0) {
            resDiv.innerHTML = '<div class="p-3 text-xs text-slate-400 italic text-center">No se encontraron productos</div>';
        } else {
            resDiv.innerHTML = PRODUCTOS_BUSQUEDA_ACTUAL.map((p, idx) => {
                const stockNum = parseInt(p.stock) || 0;
                let stockBadge = `<span class="text-[10px] text-slate-400">Stock: ${stockNum}</span>`;
                if (stockNum <= 0) {
                    stockBadge = `<span class="text-[9px] bg-rose-950/80 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded font-bold">❌ Sin stock</span>`;
                } else if (stockNum <= 2) {
                    stockBadge = `<span class="text-[9px] bg-amber-950/80 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-bold">⚠️ Poco stock: ${stockNum}</span>`;
                }

                const tieneImg = p.imagen_url && p.imagen_url !== '/img/no-image.svg' && !p.imagen_url.includes('no-image');
                const imgHtml = tieneImg
                    ? `<img src="${p.imagen_url}" alt="${escapeHtml(p.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='/img/no-image.svg';" class="w-10 h-10 rounded-lg object-contain bg-slate-950 border border-slate-700 shrink-0 p-0.5 shadow">`
                    : `<div class="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700/80 flex items-center justify-center text-slate-500 text-xs shrink-0 shadow">📷</div>`;

                const tieneVar = p.variante && p.variante.trim() !== '' && p.variante.toLowerCase() !== 'única' && p.variante.toLowerCase() !== 'unica';
                const varBadge = tieneVar
                    ? `<span class="bg-indigo-950/90 text-indigo-300 border border-indigo-700/80 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm">🎨 ${escapeHtml(p.variante)}</span>`
                    : `<span class="text-[10px] text-slate-400">Var: ${escapeHtml(p.variante || 'N/A')}</span>`;

                return `
                <div onclick="seleccionarProductoPorIndex(${idx})" class="p-2.5 hover:bg-slate-700/80 cursor-pointer border-b border-slate-700/50 last:border-b-0 flex items-center justify-between gap-3 transition">
                    <div class="flex items-center gap-3 min-w-0">
                        ${imgHtml}
                        <div class="min-w-0">
                            <div class="text-xs font-bold text-white truncate" title="${escapeHtml(p.nombre)}">${escapeHtml(p.nombre)}</div>
                            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                ${varBadge}
                                ${p.codigo_sku ? `<span class="text-[10px] text-slate-400 font-mono">${escapeHtml(p.codigo_sku)}</span><span class="text-slate-500 text-[10px]">•</span>` : ''}
                                ${stockBadge}
                            </div>
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <div class="text-xs font-extrabold text-emerald-400">$${parseFloat(p.precio).toFixed(2)}</div>
                    </div>
                </div>
            `;
            }).join('');
        }
        resDiv.classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}

function seleccionarProductoPorIndex(idx) {
    const p = PRODUCTOS_BUSQUEDA_ACTUAL[idx];
    if (p) seleccionarProducto(p);
}

function seleccionarProducto(p) {
    const existe = carrito.find(item => item.id === p.id);
    if (existe) {
        existe.cantidad += 1;
        showToast(`Sumado: ${p.nombre} (x${existe.cantidad})`, 'info');
    } else {
        carrito.push({
            id: p.id,
            nombre: p.nombre,
            variante: p.variante,
            codigo_sku: p.codigo_sku || '',
            imagen_url: p.imagen_url || '/img/no-image.svg',
            precio: parseFloat(p.precio),
            cantidad: 1
        });
        const detalleVar = (p.variante && p.variante !== 'Única') ? ` (${p.variante})` : '';
        showToast(`Agregado: ${p.nombre}${detalleVar}`, 'success');
    }
    document.getElementById('prodSearch').value = '';
    document.getElementById('prodResults').classList.add('hidden');
    renderCarrito();
}

function renderCarrito() {
    const container = document.getElementById('carritoContainer');
    if (carrito.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-500 italic py-1">No hay productos seleccionados.</p>';
        calcularTotal();
        return;
    }

    container.innerHTML = carrito.map((item, index) => {
        const tieneImg = item.imagen_url && item.imagen_url !== '/img/no-image.svg' && !item.imagen_url.includes('no-image');
        const imgHtml = tieneImg
            ? `<img src="${item.imagen_url}" alt="${escapeHtml(item.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='/img/no-image.svg';" class="w-11 h-11 rounded-lg object-contain bg-slate-950 border border-slate-700/80 shrink-0 p-0.5 shadow">`
            : `<div class="w-11 h-11 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 text-xs shrink-0 shadow">📷</div>`;

        const tieneVar = item.variante && item.variante.trim() !== '' && item.variante.toLowerCase() !== 'única' && item.variante.toLowerCase() !== 'unica';
        const varBadge = tieneVar
            ? `<span class="bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm">🎨 ${escapeHtml(item.variante)}</span>`
            : (item.variante ? `<span class="text-[10px] text-slate-400">Var: ${escapeHtml(item.variante)}</span>` : '');

        return `
        <div class="flex items-center justify-between bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/80 text-xs gap-3 transition hover:border-slate-600 shadow-sm">
            <div class="flex items-center gap-3 min-w-0 flex-1">
                ${imgHtml}
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-white truncate" title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</div>
                    <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                        ${varBadge}
                        ${item.codigo_sku ? `<span class="text-[10px] text-slate-400 font-mono">${escapeHtml(item.codigo_sku)}</span>` : ''}
                        <span class="text-[10px] text-slate-400 font-medium">($${parseFloat(item.precio).toFixed(2)} c/u)</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <input type="number" min="1" value="${item.cantidad}" onchange="cambiarCantidad(${index}, this.value)" class="w-12 bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-center font-bold text-white focus:outline-none focus:border-amber-500">
                <div class="font-extrabold text-emerald-400 w-20 text-right">$${(item.precio * item.cantidad).toFixed(2)}</div>
                <button type="button" onclick="eliminarDelCarrito(${index})" class="text-rose-400 hover:text-rose-300 font-bold p-1 hover:bg-rose-950/40 rounded transition" title="Quitar">✕</button>
            </div>
        </div>
        `;
    }).join('');

    calcularTotal();
}

function cambiarCantidad(index, val) {
    const c = parseInt(val);
    if (c > 0) {
        carrito[index].cantidad = c;
        renderCarrito();
    }
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderCarrito();
}

function calcularTotal() {
    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const costoEnvio = parseFloat(document.getElementById('costo_envio').value) || 0;
    const total = subtotal + costoEnvio;
    document.getElementById('totalLabel').textContent = `$${total.toFixed(2)}`;
}

// ==========================================
// GUARDAR Y GESTIONAR ÓRDENES
// ==========================================
async function guardarOrden(e) {
    e.preventDefault();

    if (carrito.length === 0) {
        showToast('Debes agregar al menos un producto al pedido.', 'warning');
        return;
    }

    const ordenId = document.getElementById('ordenId').value;
    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const costoEnvio = parseFloat(document.getElementById('costo_envio').value) || 0;

    let pago_envio = null;
    if (document.getElementById('chk_abonado_total')?.checked) {
        pago_envio = 'ABONADO_TOTAL';
    } else if (document.getElementById('chk_prod_abonado')?.checked) {
        pago_envio = 'PRODUCTO_ABONADO';
    }

    const payload = {
        fecha: document.getElementById('fecha').value,
        vendedor: document.getElementById('vendedor').value,
        cliente_nombre: document.getElementById('cliente_nombre').value,
        cliente_telefono: document.getElementById('cliente_telefono').value,
        observaciones: document.getElementById('observaciones').value,
        modo_entrega: document.getElementById('modo_entrega').value,
        cadete: document.getElementById('cadete').value,
        direccion_envio: document.getElementById('direccion_envio').value,
        costo_envio: costoEnvio,
        horario_envio: document.getElementById('horario_envio').value,
        estado: document.getElementById('estado_pedido').value,
        metodo_pago: document.getElementById('metodo_pago').value,
        productos: carrito,
        total: subtotal + costoEnvio,
        marca: MARCA_ACTUAL,
        pago_envio: pago_envio
    };

    try {
        let url = '/api/ordenes';
        let method = 'POST';

        if (ordenId) {
            url = `/api/ordenes/${ordenId}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            if (!ordenId) {
                document.getElementById('modalNumOrden').textContent = data.numero_orden;
                ultimaOrdenGuardada = { ...payload, numero_orden: data.numero_orden };
                document.getElementById('modalExito').classList.remove('hidden');
                showToast(`¡Orden ${data.numero_orden} registrada con éxito!`, 'success');
            } else {
                showToast('Orden actualizada correctamente.', 'success');
            }
            limpiarFormulario();
            cargarUltimasOrdenes();
            cargarMetricasHoy();
        } else {
            showToast('Error: ' + (data.error || 'No se pudo guardar la orden.'), 'error');
        }
    } catch (err) {
        showToast('Error al conectar con el servidor.', 'error');
    }
}

async function buscarOrden() {
    const input = document.getElementById('buscarOrdenInput').value;
    if (!input) return;

    try {
        const res = await fetch(`/api/ordenes/buscar/${encodeURIComponent(input)}?marca=${MARCA_ACTUAL}`);
        const data = await res.json();

        if (res.status === 403) {
            showToast(data.error, 'error');
            return;
        }

        if (!res.ok || !data) {
            showToast('Orden no encontrada.', 'warning');
            return;
        }

        document.getElementById('ordenId').value = data.id;
        
        if (data.fecha) {
            const fechaLimpia = data.fecha.split('T')[0];
            document.getElementById('fecha').value = fechaLimpia;
        }

        document.getElementById('vendedor').value = data.vendedor || USUARIO_ACTUAL;
        document.getElementById('cliente_nombre').value = data.cliente_nombre || '';
        document.getElementById('cliente_telefono').value = data.cliente_telefono || '';
        document.getElementById('observaciones').value = data.observaciones || '';
        document.getElementById('modo_entrega').value = data.modo_entrega || 'Retiro';
        document.getElementById('cadete').value = data.cadete || '';
        document.getElementById('direccion_envio').value = data.direccion_envio || '';
        document.getElementById('costo_envio').value = data.costo_envio || 0;
        document.getElementById('horario_envio').value = data.horario_envio || '';
        
        const est = data.estado || 'Iniciado';
        document.getElementById('estado_pedido').value = est;
        actualizarColorEstado(est);

        document.getElementById('metodo_pago').value = data.metodo_pago || 'Sin especificar';

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.textContent = 'Actualizar Orden';
        }

        toggleEnvioFields();

        // Restaurar estado de pago de envío
        const chkProd = document.getElementById('chk_prod_abonado');
        const chkTotal = document.getElementById('chk_abonado_total');
        if (chkProd) chkProd.checked = (data.pago_envio === 'PRODUCTO_ABONADO');
        if (chkTotal) chkTotal.checked = (data.pago_envio === 'ABONADO_TOTAL');

        carrito = (data.orden_detalles || []).map(d => {
            const prodLocal = (typeof CATALOGO_PRODUCTOS !== 'undefined' && Array.isArray(CATALOGO_PRODUCTOS)) ? CATALOGO_PRODUCTOS.find(p => p.id === d.producto_id) : null;
            return {
                id: d.producto_id,
                nombre: (d.productos && d.productos.nombre) ? d.productos.nombre : 'Producto',
                variante: d.productos ? d.productos.variante : '',
                codigo_sku: d.productos ? (d.productos.codigo_sku || '') : (prodLocal?.codigo_sku || ''),
                imagen_url: (d.productos && d.productos.imagen_url) || prodLocal?.imagen_url || '/img/no-image.svg',
                precio: parseFloat(d.precio_unitario),
                cantidad: d.cantidad
            };
        });

        renderCarrito();
        showToast(`Orden ${data.numero_orden} cargada en formulario.`, 'info');
    } catch (err) {
        showToast('Error al buscar la orden.', 'error');
    }
}

// ==========================================
// LISTADO DE ÓRDENES Y ACCIONES RÁPIDAS (CON DESPLEGABLE EN MÓVIL)
// ==========================================
function toggleListaPedidosMovil() {
    if (window.innerWidth >= 1024) return;
    const container = document.getElementById('contenedorListaPedidosMovil');
    const icono = document.getElementById('iconoDesplegableMovil');
    if (!container) return;

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        if (icono) icono.innerHTML = '📋 Ocultar ▲';
        // Scroll suave hacia la lista al abrir
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        container.classList.add('hidden');
        if (icono) icono.innerHTML = '📋 Ver Pedidos ▼';
    }
}

function sincronizarFiltroMovil(val) {
    const filtroDesk = document.getElementById('filtroEstadoLista');
    if (filtroDesk) filtroDesk.value = val;
    cargarUltimasOrdenes();
}

function filtrarEnviosPendientes() {
    const filtroDesk = document.getElementById('filtroEstadoLista');
    const filtroMovil = document.getElementById('filtroEstadoListaMovil');
    if (filtroDesk) filtroDesk.value = 'ENVIOS_PENDIENTES';
    if (filtroMovil) filtroMovil.value = 'ENVIOS_PENDIENTES';

    // En móvil, desplegar la lista si está oculta
    if (window.innerWidth < 1024) {
        const container = document.getElementById('contenedorListaPedidosMovil');
        const icono = document.getElementById('iconoDesplegableMovil');
        if (container && container.classList.contains('hidden')) {
            container.classList.remove('hidden');
            if (icono) icono.innerHTML = '📋 Ocultar ▲';
        }
        container?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast('Filtrando envíos a domicilio pendientes...', 'info');
    cargarUltimasOrdenes();
}

// ==========================================
// NAVEGACIÓN ENTRE PANTALLAS (Desktop & Móvil)
// ==========================================
let SECCION_ACTUAL = 'nueva';

function cambiarSeccion(seccion) {
    const esIncanto = MARCA_ACTUAL === 'incanto';
    const puedeMayorista = esIncanto && (ES_ADMIN || !!PERMISOS_ACTUALES.mayorista);
    const puedeStock = ES_ADMIN || !!PERMISOS_ACTUALES.stock;
    const puedeInformes = ES_ADMIN || !!PERMISOS_ACTUALES.informes;
    const puedeNueva = ES_ADMIN || !!PERMISOS_ACTUALES.nueva_orden;
    const puedeBusqueda = ES_ADMIN || !!PERMISOS_ACTUALES.busqueda;
    const puedeUsuarios = ES_ADMIN || (USUARIO_ACTUAL || '').toLowerCase().trim() === 'npanadisi';

    // Validar permisos de la sección solicitada
    if (seccion === 'mayorista' && !puedeMayorista) seccion = 'nueva';
    if (seccion === 'usuarios' && !puedeUsuarios) seccion = 'nueva';
    if (seccion === 'informes' && !puedeInformes) seccion = 'nueva';
    if (seccion === 'stock' && !puedeStock) seccion = 'nueva';
    if (seccion === 'busqueda' && !puedeBusqueda) seccion = 'nueva';
    if (seccion === 'nueva' && !puedeNueva) {
        if (puedeMayorista) seccion = 'mayorista';
        else if (puedeBusqueda) seccion = 'busqueda';
        else if (puedeStock) seccion = 'stock';
        else if (puedeInformes) seccion = 'informes';
    }

    SECCION_ACTUAL = seccion;

    // Referencias a todas las secciones del cuerpo principal
    const secciones = {
        nueva: document.getElementById('seccionNuevaOrden'),
        busqueda: document.getElementById('seccionBusquedaOrdenes'),
        mayorista: document.getElementById('seccionMayorista'),
        stock: document.getElementById('seccionStock'),
        informes: document.getElementById('seccionInformes'),
        usuarios: document.getElementById('seccionUsuarios')
    };

    // Alternar visibilidad de las pantallas (SPA completo)
    Object.keys(secciones).forEach(key => {
        const el = secciones[key];
        if (el) {
            if (key === seccion) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });

    // Control de KPIs superiores: visibles únicamente en Nueva y Búsqueda
    const kpisSuperiores = document.getElementById('contenedorKpisSuperiores');
    if (kpisSuperiores) {
        if (seccion === 'nueva' || seccion === 'busqueda') kpisSuperiores.classList.remove('hidden');
        else kpisSuperiores.classList.add('hidden');
    }

    // Estilos dinámicos para los botones de navegación
    const bgActivo = esIncanto ? 'bg-rose-600' : 'bg-sky-600';
    const textActivo = esIncanto ? 'text-rose-400' : 'text-sky-400';

    const sideBtns = {
        nueva: document.getElementById('sideNavNueva'),
        busqueda: document.getElementById('sideNavBusqueda'),
        stock: document.getElementById('sideNavStock'),
        informes: document.getElementById('btnMenuInformes'),
        mayorista: document.getElementById('sideNavMayorista'),
        usuarios: document.getElementById('btnMenuUsuarios')
    };

    const bottomBtns = {
        nueva: document.getElementById('bottomNavNueva'),
        busqueda: document.getElementById('bottomNavBusqueda'),
        stock: document.getElementById('bottomNavStock'),
        informes: document.getElementById('bottomNavInformes'),
        mayorista: document.getElementById('bottomNavMayorista'),
        usuarios: document.getElementById('bottomNavUsuarios')
    };

    // Visibilidad especial de Mayorista
    if (sideBtns.mayorista) {
        sideBtns.mayorista.style.display = puedeMayorista ? 'flex' : 'none';
        if (!puedeMayorista) sideBtns.mayorista.classList.add('hidden');
        else sideBtns.mayorista.classList.remove('hidden');
    }
    if (bottomBtns.mayorista) {
        bottomBtns.mayorista.style.display = puedeMayorista ? 'flex' : 'none';
        if (!puedeMayorista) bottomBtns.mayorista.classList.add('hidden');
        else bottomBtns.mayorista.classList.remove('hidden');
    }

    // Estilos del menú lateral Desktop
    const classInactivoSide = "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700/70 transition border border-transparent";
    if (sideBtns.nueva) sideBtns.nueva.className = seccion === 'nueva' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition ${bgActivo} text-white shadow-lg` : classInactivoSide;
    if (sideBtns.busqueda) sideBtns.busqueda.className = seccion === 'busqueda' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition ${bgActivo} text-white shadow-lg` : classInactivoSide;
    if (sideBtns.stock) sideBtns.stock.className = seccion === 'stock' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition bg-amber-600 text-white shadow-lg` : "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold text-amber-400 hover:bg-slate-700/70 transition border border-amber-500/20 bg-slate-900/40";
    if (sideBtns.informes) sideBtns.informes.className = seccion === 'informes' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-lg` : "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold text-emerald-300 hover:bg-slate-700/70 transition border border-emerald-500/30 bg-emerald-950/40";
    if (sideBtns.mayorista) sideBtns.mayorista.className = seccion === 'mayorista' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition bg-pink-600 text-white shadow-lg` : "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold text-pink-300 hover:bg-slate-700/70 transition border border-pink-500/40 bg-pink-950/40";
    if (sideBtns.usuarios) sideBtns.usuarios.className = seccion === 'usuarios' ? `w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition bg-violet-600 text-white shadow-lg` : "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold text-violet-300 hover:bg-slate-700/70 transition border border-violet-500/40 bg-violet-950/40";

    // Estilos de la barra inferior Móvil
    const classInactivoBottom = "flex flex-col items-center justify-center py-1 px-3 rounded-xl transition text-slate-400 hover:text-slate-200";
    if (bottomBtns.nueva) bottomBtns.nueva.className = seccion === 'nueva' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${textActivo} font-bold` : classInactivoBottom;
    if (bottomBtns.busqueda) bottomBtns.busqueda.className = seccion === 'busqueda' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${textActivo} font-bold` : classInactivoBottom;
    if (bottomBtns.stock) bottomBtns.stock.className = seccion === 'stock' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition text-amber-400 font-bold` : classInactivoBottom;
    if (bottomBtns.informes) bottomBtns.informes.className = seccion === 'informes' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition text-emerald-400 font-bold` : classInactivoBottom;
    if (bottomBtns.mayorista) bottomBtns.mayorista.className = seccion === 'mayorista' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition text-pink-400 font-bold` : classInactivoBottom;
    if (bottomBtns.usuarios) bottomBtns.usuarios.className = seccion === 'usuarios' ? `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition text-violet-400 font-bold` : classInactivoBottom;

    // Disparadores específicos por sección
    if (seccion === 'busqueda') {
        ejecutarBusquedaAvanzada();
    } else if (seccion === 'mayorista') {
        inicializarModuloMayorista();
    } else if (seccion === 'stock') {
        configurarEncabezadoStock();
        cargarCatalogoProductos();
    } else if (seccion === 'usuarios') {
        cancelarEdicionUsuario();
        cargarListaUsuarios();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function irABusquedaConFiltro(estado) {
    cambiarSeccion('busqueda');
    const selectEstado = document.getElementById('filtroBusquedaEstado');
    if (selectEstado) {
        selectEstado.value = estado;
    }
    ejecutarBusquedaAvanzada();
}

function renderizarTarjetaOrden(o) {
    let colorBorder = 'border-amber-700/60 bg-amber-950/30';
    let colorTexto = 'text-amber-400';
    if (o.estado === 'Abonado') { colorBorder = 'border-blue-700/60 bg-blue-950/30'; colorTexto = 'text-blue-400'; }
    if (o.estado === 'Preparado') { colorBorder = 'border-purple-700/60 bg-purple-950/30'; colorTexto = 'text-purple-400'; }
    if (o.estado === 'Finalizado') { colorBorder = 'border-emerald-700/60 bg-emerald-950/30'; colorTexto = 'text-emerald-400'; }
    if (o.estado === 'Cancelado') { colorBorder = 'border-rose-700/60 bg-rose-950/30'; colorTexto = 'text-rose-400'; }

    const vendedorTxt = o.vendedor ? `• 👤 ${o.vendedor}` : '';
    const telefonoTxt = o.cliente_telefono ? `• 📞 ${o.cliente_telefono}` : '';

    return `
        <div class="p-3 bg-slate-900/90 hover:bg-slate-900 rounded-xl border ${colorBorder} transition flex flex-col justify-between gap-2 text-xs group shadow-sm">
            <div class="cursor-pointer" onclick="cargarOrdenEnFormulario('${o.numero_orden}')">
                <div class="flex justify-between items-start gap-2">
                    <div>
                        <div class="font-black text-white flex items-center gap-1.5 flex-wrap">
                            <span class="text-sm font-black tracking-wide">${o.numero_orden}</span>
                            <span class="font-bold text-slate-200 text-xs truncate max-w-[170px]">${o.cliente_nombre || 'Cliente S/D'}</span>
                        </div>
                        <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-1 flex-wrap">
                            <span>📅 ${formatearFechaVista(o.fecha)}</span>
                            <span>${o.modo_entrega === 'Envio' ? '🛵 Envío' : '🛍️ Retiro'}</span>
                            <span>${vendedorTxt}</span>
                            <span>${telefonoTxt}</span>
                        </div>
                    </div>
                    <div class="text-right whitespace-nowrap">
                        <div class="font-extrabold text-emerald-400 text-sm sm:text-base">$${parseFloat(o.total || 0).toFixed(2)}</div>
                        <span class="text-[9px] uppercase font-bold text-slate-400 block">${o.metodo_pago || 'S/D'}</span>
                    </div>
                </div>

                ${o.observaciones ? `
                    <div class="text-[10px] text-slate-400 italic bg-slate-950/50 p-1.5 rounded mt-1.5 line-clamp-1 border border-slate-800">
                        📝 ${o.observaciones}
                    </div>
                ` : ''}
            </div>

            <!-- Fila de Acciones Rápidas: Selector de Estado e Impresión Directa -->
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] text-slate-400 font-semibold">Estado:</span>
                    <select onchange="cambiarEstadoRapido(${o.id}, this.value)" class="bg-slate-800 border border-slate-700 text-[10px] font-bold ${colorTexto} rounded-md px-2 py-1 focus:outline-none">
                        <option value="Iniciado" ${o.estado === 'Iniciado' ? 'selected' : ''}>🟡 Iniciado</option>
                        <option value="Abonado" ${o.estado === 'Abonado' ? 'selected' : ''}>🔵 Abonado</option>
                        <option value="Preparado" ${o.estado === 'Preparado' ? 'selected' : ''}>🟣 Preparado</option>
                        <option value="Finalizado" ${o.estado === 'Finalizado' ? 'selected' : ''}>🟢 Finalizado</option>
                        <option value="Cancelado" ${o.estado === 'Cancelado' ? 'selected' : ''}>🔴 Cancelado</option>
                    </select>
                </div>

                <div class="flex items-center gap-1.5">
                    <button type="button" onclick="imprimirEtiquetaDirecta(${JSON.stringify(o).replace(/"/g, '&quot;')})" title="Imprimir Etiqueta" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-md text-[11px] border border-slate-700 transition flex items-center gap-1">
                        🖨️ <span class="hidden sm:inline">Ticket</span>
                    </button>
                    <button type="button" onclick="cargarOrdenEnFormulario('${o.numero_orden}')" title="Editar Pedido" class="bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 px-2.5 py-1 rounded-md text-[11px] font-bold border border-sky-500/40 transition flex items-center gap-1">
                        ✏️ <span>Editar</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Búsqueda Avanzada
const onFiltroBusquedaInput = debounce(() => ejecutarBusquedaAvanzada(), 300);

async function ejecutarBusquedaAvanzada() {
    const list = document.getElementById('listaBusquedaOrdenes');
    const contador = document.getElementById('contadorOrdenesBusqueda');
    if (!list) return;

    const q = (document.getElementById('filtroBusquedaTexto')?.value || '').trim();
    const estado = document.getElementById('filtroBusquedaEstado')?.value || 'TODOS';
    const vendedor = (document.getElementById('filtroBusquedaVendedor')?.value || '').trim();
    const fechaDesde = document.getElementById('filtroBusquedaDesde')?.value || '';
    const fechaHasta = document.getElementById('filtroBusquedaHasta')?.value || '';
    const modo_entrega = document.getElementById('filtroBusquedaModo')?.value || 'TODOS';

    const params = new URLSearchParams({
        marca: MARCA_ACTUAL,
        limite: 60
    });
    if (q) params.set('q', q);
    if (estado !== 'TODOS') params.set('estado', estado);
    if (vendedor) params.set('vendedor', vendedor);
    if (fechaDesde) params.set('fechaDesde', fechaDesde);
    if (fechaHasta) params.set('fechaHasta', fechaHasta);
    if (modo_entrega !== 'TODOS') params.set('modo_entrega', modo_entrega);

    try {
        const res = await fetch(`/api/ordenes/avanzada?${params.toString()}`);
        const ordenes = await res.json();

        if (contador) contador.textContent = (ordenes || []).length;

        if (!ordenes || ordenes.length === 0) {
            list.innerHTML = `
                <div class="p-8 text-center text-slate-400 italic md:col-span-2 bg-slate-900/40 rounded-xl border border-slate-800">
                    <p class="text-sm">No se encontraron órdenes con los criterios especificados.</p>
                    <button type="button" onclick="limpiarFiltrosBusqueda()" class="mt-2 text-xs text-sky-400 hover:underline font-bold">
                        Limpiar todos los filtros
                    </button>
                </div>
            `;
            return;
        }

        list.innerHTML = ordenes.map(renderizarTarjetaOrden).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-xs text-rose-400 p-4 md:col-span-2 text-center">Error al buscar órdenes.</p>';
    }
}

function limpiarFiltrosBusqueda() {
    if (document.getElementById('filtroBusquedaTexto')) document.getElementById('filtroBusquedaTexto').value = '';
    if (document.getElementById('filtroBusquedaEstado')) document.getElementById('filtroBusquedaEstado').value = 'TODOS';
    if (document.getElementById('filtroBusquedaVendedor')) document.getElementById('filtroBusquedaVendedor').value = '';
    if (document.getElementById('filtroBusquedaDesde')) document.getElementById('filtroBusquedaDesde').value = '';
    if (document.getElementById('filtroBusquedaHasta')) document.getElementById('filtroBusquedaHasta').value = '';
    if (document.getElementById('filtroBusquedaModo')) document.getElementById('filtroBusquedaModo').value = 'TODOS';
    ejecutarBusquedaAvanzada();
}

async function cargarUltimasOrdenes() {
    // Si la sección de búsqueda está visible, refrescar la búsqueda avanzada
    if (SECCION_ACTUAL === 'busqueda') {
        ejecutarBusquedaAvanzada();
    }
}

async function cambiarEstadoRapido(ordenId, nuevoEstado) {
    try {
        const res = await fetch(`/api/ordenes/${ordenId}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Estado actualizado a: ${nuevoEstado}`, 'success');
            ejecutarBusquedaAvanzada();
            cargarMetricasHoy();
        } else {
            showToast('Error al actualizar estado: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al actualizar estado.', 'error');
    }
}

function nuevaOrden() {
    limpiarFormulario();
    cambiarSeccion('nueva');
    showToast('Nuevo pedido listo para registrar.', 'info');
}

function cargarOrdenEnFormulario(num) {
    cambiarSeccion('nueva');
    const input = document.getElementById('buscarOrdenInput');
    if (input) input.value = num;
    buscarOrdenDirecto(num);
}

async function buscarOrdenDirecto(num) {
    if (!num) return;
    try {
        const res = await fetch(`/api/ordenes/buscar/${encodeURIComponent(num)}?marca=${MARCA_ACTUAL}`);
        const data = await res.json();

        if (res.status === 403) {
            showToast(data.error, 'error');
            return;
        }

        if (!res.ok || !data) {
            showToast('Orden no encontrada.', 'warning');
            return;
        }

        document.getElementById('ordenId').value = data.id;
        
        if (data.fecha) {
            const fechaLimpia = data.fecha.split('T')[0];
            document.getElementById('fecha').value = fechaLimpia;
        }

        document.getElementById('vendedor').value = data.vendedor || USUARIO_ACTUAL;
        document.getElementById('cliente_nombre').value = data.cliente_nombre || '';
        document.getElementById('cliente_telefono').value = data.cliente_telefono || '';
        document.getElementById('observaciones').value = data.observaciones || '';
        document.getElementById('modo_entrega').value = data.modo_entrega || 'Retiro';
        document.getElementById('cadete').value = data.cadete || '';
        document.getElementById('direccion_envio').value = data.direccion_envio || '';
        document.getElementById('costo_envio').value = data.costo_envio || 0;
        document.getElementById('horario_envio').value = data.horario_envio || '';
        
        const est = data.estado || 'Iniciado';
        document.getElementById('estado_pedido').value = est;
        actualizarColorEstado(est);

        document.getElementById('metodo_pago').value = data.metodo_pago || 'Sin especificar';

        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.textContent = 'Actualizar Orden';
        }

        const labelTitulo = document.getElementById('labelFormularioTitulo');
        if (labelTitulo) {
            labelTitulo.innerHTML = `✏️ Editando Pedido <span class="text-amber-400">${data.numero_orden}</span>`;
        }

        toggleEnvioFields();

        // Restaurar estado de pago de envío
        const chkProd = document.getElementById('chk_prod_abonado');
        const chkTotal = document.getElementById('chk_abonado_total');
        if (chkProd) chkProd.checked = (data.pago_envio === 'PRODUCTO_ABONADO');
        if (chkTotal) chkTotal.checked = (data.pago_envio === 'ABONADO_TOTAL');

        carrito = (data.orden_detalles || []).map(d => {
            const prodLocal = (typeof CATALOGO_PRODUCTOS !== 'undefined' && Array.isArray(CATALOGO_PRODUCTOS)) ? CATALOGO_PRODUCTOS.find(p => p.id === d.producto_id) : null;
            return {
                id: d.producto_id,
                nombre: (d.productos && d.productos.nombre) ? d.productos.nombre : 'Producto',
                variante: d.productos ? d.productos.variante : '',
                codigo_sku: d.productos ? (d.productos.codigo_sku || '') : (prodLocal?.codigo_sku || ''),
                imagen_url: (d.productos && d.productos.imagen_url) || prodLocal?.imagen_url || '/img/no-image.svg',
                precio: parseFloat(d.precio_unitario),
                cantidad: d.cantidad
            };
        });

        renderCarrito();
        showToast(`Orden ${data.numero_orden} cargada en formulario.`, 'info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showToast('Error al cargar la orden.', 'error');
    }
}

function limpiarFormulario() {
    document.getElementById('ordenForm').reset();
    document.getElementById('ordenId').value = '';
    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('vendedor').value = USUARIO_ACTUAL;
    document.getElementById('observaciones').value = '';
    document.getElementById('estado_pedido').value = 'Iniciado';
    actualizarColorEstado('Iniciado');
    document.getElementById('metodo_pago').value = 'Sin especificar';
    
    const labelTitulo = document.getElementById('labelFormularioTitulo');
    if (labelTitulo) {
        labelTitulo.innerHTML = `📝 Alta de Nueva Orden`;
    }

    const chkP = document.getElementById('chk_prod_abonado');
    const chkT = document.getElementById('chk_abonado_total');
    if (chkP) chkP.checked = false;
    if (chkT) chkT.checked = false;

    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.textContent = 'Confirmar Orden';
    }

    carrito = [];
    renderCarrito();
    toggleEnvioFields();
}

function cerrarModal() {
    document.getElementById('modalExito').classList.add('hidden');
}

// ==========================================
// MODAL EXPORTAR EXCEL AVANZADO
// ==========================================
// INFORMES Y PRESENTACIONES
// ==========================================
function abrirModalExportar() { 
    cambiarSeccion('informes');
}
function cerrarModalExportar() { 
    cambiarSeccion('nueva');
}

function setPresetExport(tipo) {
    const hoyStr = new Date().toISOString().split('T')[0];
    const inputInicio = document.getElementById('exportFechaInicio');
    const inputFin = document.getElementById('exportFechaFin');

    if (tipo === 'hoy') {
        inputInicio.value = hoyStr;
        inputFin.value = hoyStr;
    } else if (tipo === 'mes') {
        const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        inputInicio.value = primerDiaMes;
        inputFin.value = hoyStr;
    } else if (tipo === 'todo') {
        inputInicio.value = '';
        inputFin.value = '';
    }
}

function descargarInformeExcel() {
    if (!usuarioTienePermisoInformes()) {
        showToast('No tenés permisos para exportar informes.', 'error');
        return;
    }
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;
    
    showToast('Generando informe completo en Excel...', 'info');
    window.location.href = `/api/ordenes/exportar?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${MARCA_ACTUAL}&usuario=${encodeURIComponent(USUARIO_ACTUAL)}`;
    cerrarModalExportar();
}

function descargarInformePDF() {
    if (!usuarioTienePermisoInformes()) {
        showToast('No tenés permisos para exportar informes.', 'error');
        return;
    }
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;

    showToast('Generando informe PDF...', 'info');
    const url = `/reporte-presentacion?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${MARCA_ACTUAL}&usuario=${encodeURIComponent(USUARIO_ACTUAL)}&autoPdf=1`;
    window.open(url, '_blank');
    cerrarModalExportar();
}

function abrirPresentacionEnPantalla() {
    if (!usuarioTienePermisoInformes()) {
        showToast('No tenés permisos para ver informes.', 'error');
        return;
    }
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;

    showToast('Abriendo informe de gestión...', 'info');
    const url = `/reporte-presentacion?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${MARCA_ACTUAL}&usuario=${encodeURIComponent(USUARIO_ACTUAL)}`;
    window.open(url, '_blank');
    cerrarModalExportar();
}

// ==========================================
// CATÁLOGO, STOCK Y PRECIOS CON IMÁGENES Y FILTROS
// ==========================================
let CATALOGO_PRODUCTOS = [];
let CATALOGO_FILTRO_STOCK = 'todos'; // 'todos' | 'con_stock' | 'sin_stock' | 'web' | 'manual'
let CATALOGO_BUSQUEDA = '';
let CATALOGO_ORDEN = 'nombre_asc';
let CATALOGO_CARGANDO = false;
let STOCK_VIEW_MODE = localStorage.getItem('stock_vista_modo') || 'grid';

function abrirModalStock() {
    cambiarSeccion('stock');
}

function cerrarModalStock() {
    cambiarSeccion('nueva');
    cerrarModalEditarRapido();
}

function configurarEncabezadoStock() {
    const badgeMarca = document.getElementById('badgeMarcaStock');
    const subtitulo = document.getElementById('subtituloStock');
    const btnSync = document.getElementById('btnSyncWebPanatech');
    const pillWeb = document.getElementById('pillFiltroWeb');
    const pillManual = document.getElementById('pillFiltroManual');

    const esPanatech = MARCA_ACTUAL === 'panatech';
    if (badgeMarca) {
        badgeMarca.textContent = esPanatech ? 'Panatech' : 'Incanto';
        badgeMarca.className = esPanatech
            ? 'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800'
            : 'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800';
    }

    const urlTiendaNombre = esPanatech ? 'panatech.com.ar' : 'incantorosario.com.ar';
    if (subtitulo) {
        subtitulo.innerHTML = `Precios en <span class="text-emerald-400 font-semibold">Efectivo o Transferencia</span> sincronizados con <span class="${esPanatech ? 'text-sky-400' : 'text-rose-400'} font-semibold">${urlTiendaNombre}</span>`;
    }

    if (btnSync) {
        btnSync.style.display = 'flex';
        btnSync.className = esPanatech
            ? 'bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold py-2 px-3 rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-95'
            : 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-xs font-bold py-2 px-3 rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-95';
    }
    if (pillWeb) pillWeb.style.display = 'inline-block';
    if (pillManual) pillManual.style.display = 'inline-block';

    cambiarVistaStock(STOCK_VIEW_MODE);
}

function cambiarVistaStock(modo) {
    STOCK_VIEW_MODE = modo;
    try {
        localStorage.setItem('stock_vista_modo', modo);
    } catch (e) {}

    const btnGrid = document.getElementById('btnVistaStockGrid');
    const btnList = document.getElementById('btnVistaStockList');
    const contGrid = document.getElementById('contenedorGridProductos');
    const contList = document.getElementById('contenedorListaProductos');

    if (modo === 'list') {
        if (btnGrid) {
            btnGrid.className = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
        }
        if (btnList) {
            btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-slate-950 shadow';
        }
        if (contGrid) contGrid.classList.add('hidden');
        if (contList) contList.classList.remove('hidden');
    } else {
        if (btnGrid) {
            btnGrid.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-amber-500 text-slate-950 shadow';
        }
        if (btnList) {
            btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
        }
        if (contGrid) contGrid.classList.remove('hidden');
        if (contList) contList.classList.add('hidden');
    }

    renderizarCatalogoFiltrado();
}

async function cargarCatalogoProductos() {
    if (CATALOGO_CARGANDO) return;
    CATALOGO_CARGANDO = true;

    const grid = document.getElementById('listaProductosStockGrid');
    const tabla = document.getElementById('listaProductosStockTabla');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
                <div class="animate-spin text-3xl text-amber-500">⏳</div>
                <p class="text-xs font-semibold">Cargando catálogo de productos y stock...</p>
            </div>
        `;
    }
    if (tabla) {
        tabla.innerHTML = `
            <tr>
                <td colspan="6" class="py-16 text-center text-slate-400">
                    <div class="inline-block animate-spin text-2xl text-amber-500 mb-2">⏳</div>
                    <p class="text-xs font-semibold">Cargando catálogo de productos y stock...</p>
                </td>
            </tr>
        `;
    }

    try {
        const res = await fetch(`/api/productos/catalogo?marca=${MARCA_ACTUAL}&sort=${CATALOGO_ORDEN}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.productos)) {
            CATALOGO_PRODUCTOS = data.productos;
            actualizarContadoresStockPills(CATALOGO_PRODUCTOS);
            renderizarCatalogoFiltrado();

            // Info de sincronización
            const infoSync = document.getElementById('infoUltimaSyncHeader');
            if (infoSync) {
                if ((MARCA_ACTUAL === 'panatech' || MARCA_ACTUAL === 'incanto') && data.syncInfo && data.syncInfo.ultima_sincronizacion) {
                    const fecha = new Date(data.syncInfo.ultima_sincronizacion);
                    const fechaTxt = fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
                    const colorMarca = MARCA_ACTUAL === 'panatech' ? 'text-sky-400' : 'text-rose-400';
                    infoSync.innerHTML = `Última sincronización web: <span class="${colorMarca} font-semibold">${fechaTxt}</span> (${data.syncInfo.total_web || 0} en tienda)`;
                } else {
                    infoSync.textContent = '';
                }
            }
        } else {
            if (grid) {
                grid.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-rose-400">Error al cargar productos.</div>`;
            }
            if (tabla) {
                tabla.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-rose-400">Error al cargar productos.</td></tr>`;
            }
        }
    } catch (err) {
        console.error('Error al cargar catálogo:', err);
        if (grid) {
            grid.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-rose-400">Error de conexión al cargar catálogo.</div>`;
        }
        if (tabla) {
            tabla.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-rose-400">Error de conexión al cargar catálogo.</td></tr>`;
        }
    } finally {
        CATALOGO_CARGANDO = false;
    }
}

function actualizarContadoresStockPills(productos) {
    const countTodos = document.getElementById('countTodos');
    const countConStock = document.getElementById('countConStock');
    const countSinStock = document.getElementById('countSinStock');
    const countWeb = document.getElementById('countWeb');
    const countManual = document.getElementById('countManual');

    const total = productos.length;
    const conStock = productos.filter(p => p.stock > 0).length;
    const sinStock = productos.filter(p => p.stock === 0).length;
    const web = productos.filter(p => p.synced_web).length;
    const manual = productos.filter(p => !p.synced_web).length;

    if (countTodos) countTodos.textContent = total;
    if (countConStock) countConStock.textContent = conStock;
    if (countSinStock) countSinStock.textContent = sinStock;
    if (countWeb) countWeb.textContent = web;
    if (countManual) countManual.textContent = manual;
}

const onInputBusquedaCatalogo = debounce((valor) => {
    CATALOGO_BUSQUEDA = (valor || '').trim().toLowerCase();
    const btnLimpiar = document.getElementById('btnLimpiarBuscarCat');
    if (btnLimpiar) {
        if (CATALOGO_BUSQUEDA) btnLimpiar.classList.remove('hidden');
        else btnLimpiar.classList.add('hidden');
    }
    renderizarCatalogoFiltrado();
}, 200);

function limpiarBusquedaCatalogo() {
    const input = document.getElementById('catalogoBuscarInput');
    if (input) input.value = '';
    CATALOGO_BUSQUEDA = '';
    const btnLimpiar = document.getElementById('btnLimpiarBuscarCat');
    if (btnLimpiar) btnLimpiar.classList.add('hidden');
    renderizarCatalogoFiltrado();
}

function cambiarOrdenCatalogo(nuevoOrden) {
    CATALOGO_ORDEN = nuevoOrden;
    if (CATALOGO_ORDEN === 'precio_asc') {
        CATALOGO_PRODUCTOS.sort((a, b) => a.precio - b.precio);
    } else if (CATALOGO_ORDEN === 'precio_desc') {
        CATALOGO_PRODUCTOS.sort((a, b) => b.precio - a.precio);
    } else if (CATALOGO_ORDEN === 'stock_desc') {
        CATALOGO_PRODUCTOS.sort((a, b) => b.stock - a.stock);
    } else if (CATALOGO_ORDEN === 'stock_asc') {
        CATALOGO_PRODUCTOS.sort((a, b) => a.stock - b.stock);
    } else {
        CATALOGO_PRODUCTOS.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    }
    renderizarCatalogoFiltrado();
}

function setFiltroStock(filtro) {
    CATALOGO_FILTRO_STOCK = filtro;

    const botones = document.querySelectorAll('.filtro-stock-btn');
    botones.forEach(btn => {
        const f = btn.getAttribute('data-filter');
        if (f === filtro) {
            btn.className = 'filtro-stock-btn px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 shadow transition';
        } else {
            btn.className = 'filtro-stock-btn px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-750 transition';
        }
    });

    renderizarCatalogoFiltrado();
}

function renderizarCatalogoFiltrado() {
    const grid = document.getElementById('listaProductosStockGrid');
    const tabla = document.getElementById('listaProductosStockTabla');
    const resumen = document.getElementById('resumenContadorProductos');
    if (!grid && !tabla) return;

    let filtrados = CATALOGO_PRODUCTOS;

    if (CATALOGO_BUSQUEDA) {
        filtrados = filtrados.filter(p => {
            const nom = (p.nombre || '').toLowerCase();
            const sku = (p.codigo_sku || '').toLowerCase();
            const var_ = (p.variante || '').toLowerCase();
            return nom.includes(CATALOGO_BUSQUEDA) || sku.includes(CATALOGO_BUSQUEDA) || var_.includes(CATALOGO_BUSQUEDA);
        });
    }

    if (CATALOGO_FILTRO_STOCK === 'con_stock') {
        filtrados = filtrados.filter(p => p.stock > 0);
    } else if (CATALOGO_FILTRO_STOCK === 'sin_stock') {
        filtrados = filtrados.filter(p => p.stock === 0);
    } else if (CATALOGO_FILTRO_STOCK === 'web') {
        filtrados = filtrados.filter(p => p.synced_web);
    } else if (CATALOGO_FILTRO_STOCK === 'manual') {
        filtrados = filtrados.filter(p => !p.synced_web);
    }

    if (resumen) {
        const conS = filtrados.filter(p => p.stock > 0).length;
        const sinS = filtrados.filter(p => p.stock === 0).length;
        resumen.textContent = `Mostrando ${filtrados.length} productos (${conS} con stock, ${sinS} sin stock)`;
    }

    // 1. Renderizar Vista Cuadrícula (Cards)
    if (grid) {
        if (filtrados.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
                    <div class="text-4xl">🔍</div>
                    <p class="text-xs font-bold text-white">No se encontraron productos con los filtros seleccionados</p>
                    <button type="button" onclick="setFiltroStock('todos'); limpiarBusquedaCatalogo();" class="text-xs text-amber-400 hover:underline">
                        Restablecer filtros y ver todos
                    </button>
                </div>
            `;
        } else {
            grid.innerHTML = filtrados.map(p => {
                const tieneStock = p.stock > 0;
                const badgeStock = tieneStock
                    ? `<span class="bg-emerald-950/90 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow">🟢 ${p.stock} u.</span>`
                    : `<span class="bg-rose-950/90 text-rose-400 border border-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow">🔴 Sin stock</span>`;

                const badgeOrigen = p.synced_web
                    ? `<span class="bg-sky-950/90 text-sky-400 border border-sky-800/80 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1">🌐 Web</span>`
                    : `<span class="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-md">📁 Sistema</span>`;

                const tieneVariante = p.variante && p.variante.trim() !== '' && p.variante.toLowerCase() !== 'única' && p.variante.toLowerCase() !== 'unica';
                const badgeVariante = tieneVariante
                    ? `<span class="bg-indigo-950/90 text-indigo-300 border border-indigo-700/80 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow">🎨 ${escapeHtml(p.variante)}</span>`
                    : '';

                const precioFormateado = (p.precio || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                const precioListaFormateado = (p.precio_lista && p.precio_lista > p.precio)
                    ? `<span class="text-[10px] text-slate-500 line-through">$${p.precio_lista.toLocaleString('es-AR')} lista</span>`
                    : '';

                return `
                    <div class="bg-slate-850 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 flex flex-col justify-between transition group shadow-lg">
                        <!-- Imagen y Badges -->
                        <div class="relative bg-slate-950 rounded-xl overflow-hidden mb-2.5 border border-slate-800 flex items-center justify-center h-40">
                            <img src="${p.imagen_url || '/img/no-image.svg'}" 
                                 alt="${escapeHtml(p.nombre)}" 
                                 loading="lazy"
                                 onerror="this.onerror=null; this.src='/img/no-image.svg';" 
                                 class="w-full h-full object-contain p-2 group-hover:scale-105 transition duration-300">
                            
                            <div class="absolute top-2 left-2 flex items-center gap-1 flex-wrap max-w-[70%]">
                                ${badgeOrigen}
                                ${badgeVariante}
                            </div>

                            <div class="absolute top-2 right-2">
                                ${badgeStock}
                            </div>

                            ${p.url_tienda ? `
                                <a href="${p.url_tienda}" target="_blank" rel="noopener noreferrer" title="Ver en tienda online" class="absolute bottom-2 right-2 bg-slate-900/90 hover:bg-sky-600 text-slate-300 hover:text-white p-1.5 rounded-lg border border-slate-700 transition">
                                    <span class="text-xs">🔗</span>
                                </a>
                            ` : ''}
                        </div>

                        <!-- Info -->
                        <div class="space-y-1.5 flex-1 flex flex-col justify-between">
                            <div>
                                <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                    <span>${escapeHtml(p.codigo_sku || 'S/N')}</span>
                                    ${tieneVariante ? `<span class="text-indigo-400 font-bold truncate ml-1 max-w-[120px]">🎨 ${escapeHtml(p.variante)}</span>` : ''}
                                </div>
                                <h4 class="text-xs font-bold text-white line-clamp-2 mt-0.5 leading-snug group-hover:text-amber-400 transition" title="${escapeHtml(p.nombre)}">
                                    ${escapeHtml(p.nombre)}
                                </h4>
                            </div>

                            <!-- Precios -->
                            <div class="pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
                                <div>
                                    <span class="text-[9px] text-slate-400 block font-semibold uppercase tracking-wider">Efectivo / Transf.</span>
                                    <span class="text-sm font-extrabold text-emerald-400">
                                        $${precioFormateado}
                                    </span>
                                </div>
                                <div class="text-right">
                                    ${precioListaFormateado}
                                </div>
                            </div>
                        </div>

                        <!-- Botones de Acción -->
                        <div class="pt-2 mt-2 border-t border-slate-800 flex items-center gap-1.5">
                            <button type="button" onclick="abrirModalEditarPorId(${p.id})" class="flex-1 bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-200 text-xs font-bold py-2 px-3 rounded-xl border border-slate-700 hover:border-amber-500 transition flex items-center justify-center gap-1.5 shadow active:scale-95">
                                <span>✏️</span>
                                <span>Editar</span>
                            </button>
                            <button type="button" onclick="abrirModalUnificarProductos(${p.id})" title="Unificar con otro producto" class="bg-slate-800 hover:bg-violet-900/80 text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-600 p-2 rounded-xl text-xs font-bold transition flex items-center justify-center shadow active:scale-95">
                                <span>🔗</span>
                            </button>
                            <button type="button" onclick="eliminarProductoPorId(${p.id})" title="Eliminar producto" class="bg-slate-800 hover:bg-rose-900/80 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-600 p-2 rounded-xl text-xs font-bold transition flex items-center justify-center shadow active:scale-95">
                                <span>🗑️</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 2. Renderizar Vista Lista (Tabla con Casilla de Stock Editable Dinámica)
    if (tabla) {
        if (filtrados.length === 0) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="6" class="py-12 text-center text-slate-400">
                        No se encontraron productos con los filtros seleccionados.
                    </td>
                </tr>
            `;
        } else {
            tabla.innerHTML = filtrados.map(p => {
                const tieneStock = p.stock > 0;
                const tieneVariante = p.variante && p.variante.trim() !== '' && p.variante.toLowerCase() !== 'única' && p.variante.toLowerCase() !== 'unica';
                const badgeVariante = tieneVariante
                    ? `<span class="bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">🎨 ${escapeHtml(p.variante)}</span>`
                    : '';
                const badgeOrigen = p.synced_web
                    ? `<span class="bg-sky-950/80 text-sky-400 border border-sky-800/80 text-[10px] font-bold px-1.5 py-0.5 rounded">🌐 Web</span>`
                    : `<span class="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">📁 Sistema</span>`;

                const precioFormateado = (p.precio || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                const precioListaTxt = (p.precio_lista && p.precio_lista > p.precio)
                    ? `<span class="block text-[10px] text-slate-500 line-through">$${p.precio_lista.toLocaleString('es-AR')} lista</span>`
                    : '';

                return `
                    <tr class="hover:bg-slate-850/80 transition group border-b border-slate-800/80 last:border-b-0">
                        <!-- Foto -->
                        <td class="py-2.5 px-3 text-center">
                            <div class="w-12 h-12 mx-auto rounded-lg overflow-hidden bg-slate-950 border border-slate-800 p-0.5 flex items-center justify-center shadow-inner">
                                <img src="${p.imagen_url || '/img/no-image.svg'}" 
                                     alt="${escapeHtml(p.nombre)}" 
                                     loading="lazy" 
                                     onerror="this.onerror=null; this.src='/img/no-image.svg';" 
                                     class="w-full h-full object-contain">
                            </div>
                        </td>

                        <!-- Producto y Variante -->
                        <td class="py-2.5 px-3">
                            <div class="font-bold text-white text-xs leading-snug group-hover:text-amber-400 transition" title="${escapeHtml(p.nombre)}">
                                ${escapeHtml(p.nombre)}
                            </div>
                            <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                                ${badgeOrigen}
                                ${badgeVariante}
                            </div>
                        </td>

                        <!-- SKU -->
                        <td class="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                            ${escapeHtml(p.codigo_sku || 'S/N')}
                        </td>

                        <!-- Precio -->
                        <td class="py-2.5 px-3 text-right">
                            <span class="font-black text-emerald-400 text-xs">$${precioFormateado}</span>
                            ${precioListaTxt}
                        </td>

                        <!-- Casilla de Stock Dinámica -->
                        <td class="py-2.5 px-3 text-center">
                            <div class="inline-flex items-center gap-1.5">
                                <input type="number" min="0" value="${p.stock}" id="inputStock_${p.id}"
                                       onchange="guardarStockDinamico(${p.id}, this.value, this)"
                                       onkeydown="if(event.key==='Enter') this.blur()"
                                       class="w-20 bg-slate-950 border ${tieneStock ? 'border-slate-700 text-emerald-400' : 'border-rose-800 text-rose-400 bg-rose-950/20'} text-center font-black rounded-lg py-1 px-1.5 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-inner"
                                       title="Editá el stock y presioná Enter o hacé clic afuera para guardar al instante" />
                                <span id="stockFeedback_${p.id}" class="text-[10px] text-emerald-400 font-bold opacity-0 transition-opacity">✓</span>
                            </div>
                        </td>

                        <!-- Acciones -->
                        <td class="py-2.5 px-3 text-center">
                            <div class="inline-flex items-center gap-1">
                                <button type="button" onclick="abrirModalEditarPorId(${p.id})" title="Editar datos completos" class="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-300 transition">
                                    ✏️
                                </button>
                                <button type="button" onclick="abrirModalUnificarProductos(${p.id})" title="Unificar con otro producto" class="p-1.5 rounded-lg bg-slate-800 hover:bg-violet-800 text-slate-300 transition">
                                    🔗
                                </button>
                                <button type="button" onclick="eliminarProductoPorId(${p.id})" title="Eliminar producto" class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-800 text-slate-300 transition">
                                    🗑️
                                </button>
                                ${p.url_tienda ? `
                                    <a href="${p.url_tienda}" target="_blank" rel="noopener noreferrer" title="Ver en tienda online" class="p-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-300 transition">
                                        🌐
                                    </a>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}

// Actualizar Stock de forma rápida y dinámica desde la casilla de la lista
async function guardarStockDinamico(id, nuevoStock, inputEl) {
    const val = parseInt(nuevoStock);
    if (isNaN(val) || val < 0) {
        showToast('El stock debe ser un número entero mayor o igual a 0.', 'warning');
        if (inputEl) {
            const prod = CATALOGO_PRODUCTOS.find(p => p.id === id);
            inputEl.value = prod ? prod.stock : 0;
        }
        return;
    }

    const feedback = document.getElementById(`stockFeedback_${id}`);
    if (inputEl) {
        inputEl.classList.add('border-amber-400', 'bg-amber-950/20');
    }

    try {
        const res = await fetch(`/api/productos/${id}/stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: val })
        });
        const data = await res.json();

        if (data.success) {
            const prod = CATALOGO_PRODUCTOS.find(p => p.id === id);
            if (prod) prod.stock = val;
            actualizarContadoresStockPills(CATALOGO_PRODUCTOS);

            if (inputEl) {
                inputEl.classList.remove('border-amber-400', 'bg-amber-950/20');
                if (val > 0) {
                    inputEl.className = 'w-20 bg-slate-950 border border-emerald-500 text-emerald-400 text-center font-black rounded-lg py-1 px-1.5 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-inner';
                } else {
                    inputEl.className = 'w-20 bg-slate-950 border border-rose-800 text-rose-400 bg-rose-950/20 text-center font-black rounded-lg py-1 px-1.5 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition shadow-inner';
                }
            }

            if (feedback) {
                feedback.classList.remove('opacity-0');
                setTimeout(() => feedback.classList.add('opacity-0'), 1500);
            }

            showToast(`Stock actualizado a ${val} u.`, 'success');
        } else {
            showToast('Error al actualizar stock: ' + (data.error || ''), 'error');
            if (inputEl) {
                const prod = CATALOGO_PRODUCTOS.find(p => p.id === id);
                inputEl.value = prod ? prod.stock : 0;
            }
        }
    } catch (err) {
        console.error('Error al guardar stock dinámico:', err);
        showToast('Error de conexión al actualizar stock.', 'error');
        if (inputEl) {
            const prod = CATALOGO_PRODUCTOS.find(p => p.id === id);
            inputEl.value = prod ? prod.stock : 0;
        }
    }
}

// Exportar Catálogo y Stock a archivo Excel (.xlsx)
function exportarStockExcel() {
    showToast(`Generando archivo Excel de stock para ${MARCA_ACTUAL.toUpperCase()}...`, 'info');
    window.location.href = `/api/productos/exportar-excel?marca=${MARCA_ACTUAL}`;
}

// Modal y Proceso de Importación de Excel
function abrirModalImportarExcel() {
    const modal = document.getElementById('modalImportarStockExcel');
    if (!modal) return;
    const input = document.getElementById('inputArchivoExcel');
    if (input) input.value = '';
    const label = document.getElementById('labelArchivoExcel');
    if (label) label.textContent = 'Hacé clic acá para seleccionar tu archivo Excel (.xlsx)';
    const prog = document.getElementById('progresoImportacionExcel');
    if (prog) prog.classList.add('hidden');
    const btn = document.getElementById('btnConfirmarImportacion');
    if (btn) btn.disabled = false;
    modal.classList.remove('hidden');
}

function cerrarModalImportarExcel() {
    const modal = document.getElementById('modalImportarStockExcel');
    if (modal) modal.classList.add('hidden');
}

function mostrarArchivoSeleccionado(input) {
    const label = document.getElementById('labelArchivoExcel');
    if (input.files && input.files[0]) {
        label.innerHTML = `📄 Archivo seleccionado: <b class="text-sky-300">${escapeHtml(input.files[0].name)}</b> (${(input.files[0].size / 1024).toFixed(1)} KB)`;
    }
}

async function ejecutarImportacionExcel(event) {
    event.preventDefault();
    const input = document.getElementById('inputArchivoExcel');
    if (!input || !input.files || !input.files[0]) {
        showToast('Por favor seleccioná un archivo Excel (.xlsx) primero.', 'warning');
        return;
    }

    const file = input.files[0];
    const prog = document.getElementById('progresoImportacionExcel');
    const btn = document.getElementById('btnConfirmarImportacion');
    if (prog) prog.classList.remove('hidden');
    if (btn) btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const arrayBuffer = e.target.result;
                let binary = '';
                const bytes = new Uint8Array(arrayBuffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = window.btoa(binary);

                const res = await fetch('/api/productos/importar-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marca: MARCA_ACTUAL,
                        base64: base64,
                        filename: file.name
                    })
                });

                const data = await res.json();
                if (data.success) {
                    cerrarModalImportarExcel();
                    showToast(`¡Importación exitosa! ${data.actualizados} productos actualizados y ${data.creados} nuevos creados.`, 'success');
                    cargarCatalogoProductos();
                } else {
                    showToast('Error al importar Excel: ' + (data.error || 'Error desconocido'), 'error');
                }
            } catch (errInner) {
                console.error(errInner);
                showToast('Error al procesar el archivo Excel: ' + errInner.message, 'error');
            } finally {
                if (prog) prog.classList.add('hidden');
                if (btn) btn.disabled = false;
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error(err);
        showToast('Error al leer el archivo: ' + err.message, 'error');
        if (prog) prog.classList.add('hidden');
        if (btn) btn.disabled = false;
    }
}

// Sincronización Web con la tienda online (panatech.com.ar o incantorosario.com.ar)
async function ejecutarSincronizacionWebPanatech() {
    const btn = document.getElementById('btnSyncWebPanatech');
    const icon = document.getElementById('iconSyncWeb');
    const text = document.getElementById('textSyncWeb');

    if (btn) btn.disabled = true;
    if (icon) icon.className = 'inline-block animate-spin';
    if (text) text.textContent = 'Sincronizando Tienda...';

    const dominioTienda = MARCA_ACTUAL === 'incanto' ? 'incantorosario.com.ar' : 'panatech.com.ar';
    showToast(`Iniciando lectura y unificación de productos desde ${dominioTienda}...`, 'info');

    try {
        const res = await fetch('/api/productos/sync-web', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marca: MARCA_ACTUAL })
        });
        const data = await res.json();

        if (data.success) {
            showToast(`¡Sincronización exitosa! ${data.totalWeb} productos en web: ${data.actualizados} actualizados, ${data.nuevos} nuevos.`, 'success');
            await cargarCatalogoProductos();
        } else {
            showToast('Error en sincronización: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        console.error('Error al sincronizar:', err);
        showToast('Error de conexión al sincronizar la tienda online.', 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.className = '';
        if (text) text.textContent = 'Sincronizar Tienda Online';
    }
}

// Helper para abrir edición por ID seguro (evita errores con comillas en atributos HTML)
function abrirModalEditarPorId(id) {
    const prod = CATALOGO_PRODUCTOS.find(p => p.id === id || String(p.id) === String(id));
    if (!prod) {
        showToast('Producto no encontrado.', 'warning');
        return;
    }
    abrirModalEditarRapido(prod);
}

// Eliminar producto directamente por ID desde la tarjeta o modal
async function eliminarProductoPorId(id) {
    const prod = CATALOGO_PRODUCTOS.find(p => p.id === id || String(p.id) === String(id));
    if (!prod) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar el producto "${prod.nombre}" del catálogo?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            showToast(data.mensaje || 'Producto eliminado.', data.esReferenciado ? 'warning' : 'success');
            CATALOGO_PRODUCTOS = CATALOGO_PRODUCTOS.filter(p => String(p.id) !== String(id));
            actualizarContadoresStockPills(CATALOGO_PRODUCTOS);
            renderizarCatalogoFiltrado();
            cerrarModalEditarRapido();
        } else {
            showToast('Error al eliminar: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al eliminar producto.', 'error');
    }
}

// Modal Edición Rápida de Producto
function abrirModalEditarRapido(prod) {
    if (!prod) return;
    document.getElementById('editRapidoId').value = prod.id;
    document.getElementById('editRapidoNombre').value = prod.nombre || '';
    document.getElementById('editRapidoPrecio').value = prod.precio || 0;
    document.getElementById('editRapidoStock').value = prod.stock || 0;

    const inputVar = document.getElementById('editRapidoVariante');
    if (inputVar) inputVar.value = (prod.variante && prod.variante !== 'Única') ? prod.variante : '';

    const inputImg = document.getElementById('editRapidoImagenUrl');
    if (inputImg) {
        inputImg.value = prod.imagen_url && prod.imagen_url !== '/img/no-image.svg' ? prod.imagen_url : '';
        inputImg.oninput = () => {
            const previewImg = document.getElementById('editRapidoImg');
            if (previewImg) previewImg.src = inputImg.value.trim() || '/img/no-image.svg';
        };
    }

    document.getElementById('editRapidoSku').textContent = prod.codigo_sku || 'S/N';
    document.getElementById('editRapidoTituloPreview').textContent = prod.nombre || '';

    const img = document.getElementById('editRapidoImg');
    if (img) img.src = prod.imagen_url || '/img/no-image.svg';

    const badgeWeb = document.getElementById('editRapidoBadgeWeb');
    if (badgeWeb) {
        badgeWeb.textContent = prod.synced_web ? '🌐 Vinculado a Tienda Web' : '📁 Producto del Sistema';
    }

    const modal = document.getElementById('modalEditarProdRapido');
    if (modal) modal.classList.remove('hidden');
}

function cerrarModalEditarRapido() {
    const modal = document.getElementById('modalEditarProdRapido');
    if (modal) modal.classList.add('hidden');
}

async function guardarEdicionRapidaProducto(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('editRapidoId').value;
    const nombre = document.getElementById('editRapidoNombre').value;
    const precio = document.getElementById('editRapidoPrecio').value;
    const stock = document.getElementById('editRapidoStock').value;
    const variante = document.getElementById('editRapidoVariante') ? document.getElementById('editRapidoVariante').value.trim() : '';
    const imagen_url = document.getElementById('editRapidoImagenUrl') ? document.getElementById('editRapidoImagenUrl').value.trim() : '';

    if (!nombre || nombre.trim() === '') {
        showToast('El nombre del producto no puede estar vacío.', 'warning');
        return;
    }

    try {
        const res = await fetch(`/api/productos/${id}/stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre,
                precio,
                stock,
                variante: variante || 'Única',
                imagen_url: imagen_url || '/img/no-image.svg'
            })
        });
        const data = await res.json();

        if (data.success) {
            showToast('Producto, variante y stock actualizados correctamente.', 'success');

            // Actualizar localmente en memoria
            const idx = CATALOGO_PRODUCTOS.findIndex(p => String(p.id) === String(id));
            if (idx !== -1) {
                CATALOGO_PRODUCTOS[idx].nombre = nombre;
                CATALOGO_PRODUCTOS[idx].precio = parseFloat(precio);
                CATALOGO_PRODUCTOS[idx].precio_efectivo = parseFloat(precio);
                CATALOGO_PRODUCTOS[idx].stock = parseInt(stock, 10);
                CATALOGO_PRODUCTOS[idx].variante = variante || 'Única';
                CATALOGO_PRODUCTOS[idx].imagen_url = imagen_url || '/img/no-image.svg';
                actualizarContadoresStockPills(CATALOGO_PRODUCTOS);
                renderizarCatalogoFiltrado();
            }

            cerrarModalEditarRapido();
        } else {
            showToast('Error al actualizar el producto: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al actualizar.', 'error');
    }
}

async function eliminarProductoDesdeModalRapido() {
    const id = document.getElementById('editRapidoId').value;
    if (id) {
        await eliminarProductoPorId(id);
    }
}

// ==========================================
// UNIFICACIÓN DE PRODUCTOS
// ==========================================
let PRODUCTO_UNIFICAR_A = null;
let PRODUCTO_UNIFICAR_B = null;

function abrirModalUnificarProductos(idInicial = null) {
    PRODUCTO_UNIFICAR_A = null;
    PRODUCTO_UNIFICAR_B = null;

    const modal = document.getElementById('modalUnificarProductos');
    if (!modal) return;

    document.getElementById('buscarUnificarInputA').value = '';
    document.getElementById('buscarUnificarInputB').value = '';
    document.getElementById('sugerenciasUnificarA').classList.add('hidden');
    document.getElementById('sugerenciasUnificarB').classList.add('hidden');
    document.getElementById('previewUnificarA').innerHTML = '<span class="italic">Buscá y seleccioná el primer producto</span>';
    document.getElementById('previewUnificarB').innerHTML = '<span class="italic">Buscá y seleccioná el segundo producto</span>';
    document.getElementById('labelRadioConsA').classList.add('hidden');
    document.getElementById('labelRadioConsB').classList.add('hidden');
    document.getElementById('radioConsA').checked = true;

    const btn = document.getElementById('btnConfirmarUnificar');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    if (idInicial) {
        seleccionarProductoParaUnificar('A', idInicial);
    }

    modal.classList.remove('hidden');
}

function cerrarModalUnificarProductos() {
    const modal = document.getElementById('modalUnificarProductos');
    if (modal) modal.classList.add('hidden');
}

function filtrarOpcionesUnificar(lado, termino) {
    const contenedor = document.getElementById(`sugerenciasUnificar${lado}`);
    const q = (termino || '').trim().toLowerCase();

    if (!q) {
        contenedor.classList.add('hidden');
        return;
    }

    const matches = CATALOGO_PRODUCTOS.filter(p => {
        const nom = (p.nombre || '').toLowerCase();
        const sku = (p.codigo_sku || '').toLowerCase();
        return nom.includes(q) || sku.includes(q);
    }).slice(0, 15);

    if (matches.length === 0) {
        contenedor.innerHTML = '<div class="p-2 text-xs text-slate-400 text-center">Sin resultados</div>';
    } else {
        contenedor.innerHTML = matches.map(p => `
            <div onclick="seleccionarProductoParaUnificar('${lado}', ${p.id})" class="p-2.5 hover:bg-slate-850 cursor-pointer border-b border-slate-800 text-xs text-white flex items-center justify-between gap-2 transition">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${p.imagen_url || '/img/no-image.svg'}" onerror="this.src='/img/no-image.svg'" class="w-8 h-8 rounded object-contain bg-slate-900 border border-slate-700 shrink-0">
                    <div class="truncate">
                        <b class="text-white">${p.nombre}</b>
                        <span class="text-[10px] text-slate-400 block font-mono">${p.codigo_sku || ''} • Stock: ${p.stock}</span>
                    </div>
                </div>
                <span class="text-emerald-400 font-bold shrink-0">$${(p.precio || 0).toLocaleString('es-AR')}</span>
            </div>
        `).join('');
    }

    contenedor.classList.remove('hidden');
}

function seleccionarProductoParaUnificar(lado, id) {
    const prod = CATALOGO_PRODUCTOS.find(p => p.id === id || String(p.id) === String(id));
    if (!prod) return;

    if (lado === 'A') {
        PRODUCTO_UNIFICAR_A = prod;
        document.getElementById('buscarUnificarInputA').value = prod.nombre;
        document.getElementById('sugerenciasUnificarA').classList.add('hidden');
        renderizarPreviewUnificar('A', prod);
        document.getElementById('labelRadioConsA').classList.remove('hidden');
    } else {
        PRODUCTO_UNIFICAR_B = prod;
        document.getElementById('buscarUnificarInputB').value = prod.nombre;
        document.getElementById('sugerenciasUnificarB').classList.add('hidden');
        renderizarPreviewUnificar('B', prod);
        document.getElementById('labelRadioConsB').classList.remove('hidden');
    }

    verificarEstadoBotonUnificar();
}

function renderizarPreviewUnificar(lado, p) {
    const preview = document.getElementById(`previewUnificar${lado}`);
    if (!preview) return;

    const badgeOrigen = p.synced_web
        ? `<span class="bg-sky-950/90 text-sky-400 border border-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-md">🌐 Tienda Web</span>`
        : `<span class="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">📁 Solo Sistema</span>`;

    preview.innerHTML = `
        <div class="flex items-center gap-3 w-full text-left">
            <img src="${p.imagen_url || '/img/no-image.svg'}" onerror="this.src='/img/no-image.svg'" class="w-16 h-16 rounded-xl object-contain bg-slate-950 border border-slate-800 shrink-0">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    ${badgeOrigen}
                    <span class="text-[10px] font-mono text-slate-400">${p.codigo_sku || ''}</span>
                </div>
                <h4 class="text-xs font-bold text-white truncate" title="${p.nombre}">${p.nombre}</h4>
                <div class="flex items-center justify-between mt-1 text-xs">
                    <span class="text-emerald-400 font-bold">$${(p.precio || 0).toLocaleString('es-AR')}</span>
                    <span class="${p.stock > 0 ? 'text-amber-400' : 'text-rose-400'} font-semibold font-mono">Stock: ${p.stock} u.</span>
                </div>
            </div>
        </div>
    `;
}

function verificarEstadoBotonUnificar() {
    const btn = document.getElementById('btnConfirmarUnificar');
    if (!btn) return;

    if (PRODUCTO_UNIFICAR_A && PRODUCTO_UNIFICAR_B && PRODUCTO_UNIFICAR_A.id !== PRODUCTO_UNIFICAR_B.id) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

async function ejecutarUnificacionConfirmada() {
    if (!PRODUCTO_UNIFICAR_A || !PRODUCTO_UNIFICAR_B) return;
    if (PRODUCTO_UNIFICAR_A.id === PRODUCTO_UNIFICAR_B.id) {
        showToast('Debes seleccionar dos productos distintos para unificar.', 'warning');
        return;
    }

    const conservadoLado = document.querySelector('input[name="radioConservar"]:checked')?.value || 'A';
    const prodConservar = conservadoLado === 'A' ? PRODUCTO_UNIFICAR_A : PRODUCTO_UNIFICAR_B;
    const prodEliminar = conservadoLado === 'A' ? PRODUCTO_UNIFICAR_B : PRODUCTO_UNIFICAR_A;
    const sumarStock = document.getElementById('checkSumarStockUnificar').checked;

    const mensajeConfirm = `¿Confirmás la unificación?\n\n• SE CONSERVA: "${prodConservar.nombre}"\n• SE ABSORBE Y ELIMINA: "${prodEliminar.nombre}"\n\nTodo el historial de ventas del producto absorbido pasará al conservado.`;
    if (!confirm(mensajeConfirm)) {
        return;
    }

    const btn = document.getElementById('btnConfirmarUnificar');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>Unificando...</span>';

    try {
        const res = await fetch('/api/productos/unificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idConservar: prodConservar.id,
                idEliminar: prodEliminar.id,
                sumarStock
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(data.mensaje || 'Productos unificados correctamente.', 'success');
            cerrarModalUnificarProductos();
            await cargarCatalogoProductos();
        } else {
            showToast('Error al unificar: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        console.error('Error al unificar productos:', err);
        showToast('Error de conexión al unificar productos.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔗</span><span>Confirmar Unificación</span>';
    }
}

// ==========================================
// MODAL PRODUCTO MANUAL
// ==========================================
function abrirModalManual() { document.getElementById('modalManual').classList.remove('hidden'); }
function cerrarModalManual() { document.getElementById('modalManual').classList.add('hidden'); }

async function guardarProductoManual() {
    const nombre = document.getElementById('manualNombre').value;
    const variante = document.getElementById('manualVariante').value;
    const precio = document.getElementById('manualPrecio').value;

    if (!nombre || !precio) {
        showToast('Nombre y precio son obligatorios.', 'warning');
        return;
    }

    const res = await fetch('/api/productos/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, variante, precio, stock: 99, marca: MARCA_ACTUAL })
    });

    const data = await res.json();
    if (data.success) {
        seleccionarProducto(data.producto);
        cerrarModalManual();
        document.getElementById('manualNombre').value = '';
        document.getElementById('manualVariante').value = '';
        document.getElementById('manualPrecio').value = '';
        showToast('Producto manual creado e insertado.', 'success');
    } else {
        showToast('Error al crear producto.', 'error');
    }
}

// ==========================================
// LECTOR DE CÓDIGO DE BARRAS / CÁMARA
// ==========================================
function abrirModalScanner() {
    document.getElementById('modalScanner').classList.remove('hidden');
    iniciarEscaner();
}

function cerrarModalScanner() {
    detenerEscaner();
    document.getElementById('modalScanner').classList.add('hidden');
}

async function iniciarEscaner() {
    const statusDiv = document.getElementById('scannerStatus');
    statusDiv.textContent = 'Accediendo a la cámara...';

    if (typeof Html5Qrcode === 'undefined') {
        statusDiv.textContent = 'Librería de escaneo no disponible.';
        return;
    }

    try {
        if (!html5QrCodeScanner) {
            html5QrCodeScanner = new Html5Qrcode("scannerReader");
        }

        const config = { fps: 10, qrbox: { width: 220, height: 160 } };
        await html5QrCodeScanner.start(
            { facingMode: "environment" },
            config,
            async (decodedText) => {
                detenerEscaner();
                cerrarModalScanner();
                showToast(`Código detectado: ${decodedText}`, 'info');

                // Buscar producto por el código escaneado
                const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(decodedText)}&marca=${MARCA_ACTUAL}`);
                const productos = await res.json();

                if (productos && productos.length > 0) {
                    seleccionarProducto(productos[0]);
                } else {
                    document.getElementById('prodSearch').value = decodedText;
                    buscarProductos(decodedText);
                    showToast(`No se encontró producto exacto para ${decodedText}. Buscando coincidencias...`, 'warning');
                }
            },
            (errorMessage) => {
                // Errores de frame ignorados
            }
        );
        statusDiv.textContent = '📷 Apuntá al código de barras';
    } catch (err) {
        statusDiv.textContent = 'No se pudo activar la cámara: ' + (err.message || err);
    }
}

function detenerEscaner() {
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().catch(() => {}).finally(() => {
            html5QrCodeScanner = null;
        });
    }
}

// ==========================================
// IMPRESIÓN DE ETIQUETAS TÉRMICAS
// ==========================================
function imprimirEtiquetaUltima() {
    if (ultimaOrdenGuardada) {
        imprimirTicketPlantilla(
            ultimaOrdenGuardada.cliente_nombre,
            ultimaOrdenGuardada.cliente_telefono,
            ultimaOrdenGuardada.modo_entrega,
            ultimaOrdenGuardada.direccion_envio,
            ultimaOrdenGuardada.horario_envio,
            ultimaOrdenGuardada.costo_envio,
            ultimaOrdenGuardada.total,
            document.getElementById('chk_prod_abonado')?.checked,
            document.getElementById('chk_abonado_total')?.checked
        );
    } else {
        imprimirEtiqueta();
    }
}

function imprimirEtiquetaDirecta(orden) {
    if (!orden) return;
    const chkProd = orden.pago_envio === 'PRODUCTO_ABONADO';
    const chkTotal = orden.pago_envio === 'ABONADO_TOTAL' || (!orden.pago_envio && (orden.estado === 'Abonado' || orden.estado === 'Finalizado'));

    imprimirTicketPlantilla(
        orden.cliente_nombre,
        orden.cliente_telefono,
        orden.modo_entrega,
        orden.direccion_envio,
        orden.horario_envio,
        orden.costo_envio || 0,
        orden.total || 0,
        chkProd,
        chkTotal
    );
}

function imprimirEtiqueta() {
    const cliente = document.getElementById('cliente_nombre').value || 'Cliente sin especificar';
    const telefono = document.getElementById('cliente_telefono').value || 'Sin teléfono';
    const modo = document.getElementById('modo_entrega').value;
    const direccion = document.getElementById('direccion_envio').value;
    const horario = document.getElementById('horario_envio').value;

    const chkProdAbonado = document.getElementById('chk_prod_abonado') ? document.getElementById('chk_prod_abonado').checked : false;
    const chkAbonadoTotal = document.getElementById('chk_abonado_total') ? document.getElementById('chk_abonado_total').checked : false;

    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const costoEnvio = parseFloat(document.getElementById('costo_envio').value) || 0;
    const totalCompleto = subtotal + costoEnvio;

    imprimirTicketPlantilla(cliente, telefono, modo, direccion, horario, costoEnvio, totalCompleto, chkProdAbonado, chkAbonadoTotal);
}

function imprimirTicketPlantilla(cliente, telefono, modo, direccion, horario, costoEnvio, totalCompleto, chkProdAbonado, chkAbonadoTotal) {
    let etiquetaTexto = "";
    let montoMostrar = totalCompleto;
    let subtituloMonto = "";

    if (chkAbonadoTotal) {
        etiquetaTexto = `<div class="badge-abonado">ABONADO</div>`;
        montoMostrar = 0;
        subtituloMonto = "(Abonado $0.00)";
    } else if (chkProdAbonado) {
        etiquetaTexto = `<div class="badge-prod-abonado">PRODUCTO ABONADO</div>`;
        montoMostrar = costoEnvio;
        subtituloMonto = "(Cobrar solo envío)";
    } else if (modo === 'Envio' && costoEnvio > 0) {
        subtituloMonto = `(Inc. envío $${parseFloat(costoEnvio).toFixed(2)})`;
    }

    const esIncanto = MARCA_ACTUAL === 'incanto';
    const logoSrc = esIncanto ? '/logos/incanto.png' : '/logos/panatech.png';
    const colorMarca = esIncanto ? '#be123c' : '#0284c7';
    const igAccount = esIncanto ? 'incanto.rosario' : 'panatech.rosario';
    const direccionLocal = 'Callao 1255 11E, Rosario';

    const vent = window.open('', '_blank', 'width=420,height=650');
    vent.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Etiqueta de Envío</title>
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    padding: 10px; 
                    margin: 0; 
                    width: 280px; 
                    color: #000;
                }
                .ticket { 
                    border: 2px solid ${colorMarca}; 
                    border-radius: 12px; 
                    padding: 12px; 
                    background: #fff;
                }
                .header { 
                    text-align: center; 
                    border-bottom: 2px dashed #ccc; 
                    padding-bottom: 8px; 
                    margin-bottom: 10px; 
                }
                .logo { 
                    max-width: 100px; 
                    max-height: 50px; 
                    object-fit: contain; 
                    margin-bottom: 4px; 
                }
                .field { 
                    margin-bottom: 8px; 
                    font-size: 12px; 
                    line-height: 1.3; 
                }
                .label { 
                    font-weight: 700; 
                    color: #475569; 
                    text-transform: uppercase; 
                    font-size: 10px; 
                    display: block; 
                }
                .value { 
                    font-size: 13px; 
                    font-weight: 600; 
                    color: #0f172a; 
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .icon-img {
                    width: 14px;
                    height: 14px;
                    object-fit: contain;
                }
                .badge-modo {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: bold;
                    background: ${modo === 'Envio' ? '#e0f2fe' : '#fef3c7'};
                    color: ${modo === 'Envio' ? '#0369a1' : '#b45309'};
                    margin-top: 2px;
                }
                .badge-abonado {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 900;
                    background: #dcfce7;
                    color: #15803d;
                    border: 1px solid #16a34a;
                    margin-top: 4px;
                }
                .badge-prod-abonado {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 900;
                    background: #fef3c7;
                    color: #b45309;
                    border: 1px solid #d97706;
                    margin-top: 4px;
                }
                .total-box {
                    border-top: 2px dashed #ccc;
                    margin-top: 10px;
                    padding-top: 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .total-title {
                    font-size: 11px;
                    font-weight: 800;
                    color: #334155;
                    text-transform: uppercase;
                }
                .total-monto {
                    font-size: 16px;
                    font-weight: 900;
                    color: ${colorMarca};
                }
                .footer { 
                    font-size: 10px; 
                    margin-top: 10px; 
                    border-top: 1px dashed #ccc; 
                    padding-top: 8px; 
                    color: #475569; 
                    font-weight: 600;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .footer-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .print-bar {
                    margin-bottom: 10px;
                    text-align: center;
                }
                .btn-imprimir {
                    background: ${colorMarca};
                    color: #fff;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-weight: bold;
                    font-size: 11px;
                    cursor: pointer;
                }
                @media print {
                    .print-bar { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="print-bar">
                <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
            </div>
            <div class="ticket">
                <div class="header">
                    <img src="${logoSrc}" class="logo" alt="${MARCA_ACTUAL}" onerror="this.style.display='none'">
                </div>
                
                <div class="field">
                    <span class="label">👤 Cliente</span>
                    <span class="value">${cliente || '-'}</span>
                </div>

                <div class="field">
                    <span class="label">Teléfono</span>
                    <span class="value">
                        <img src="/logos/whatsapp.png" class="icon-img" alt="WA" onerror="this.src='https://cdn-icons-png.flaticon.com/512/733/733585.png'">
                        ${telefono || '-'}
                    </span>
                </div>

                <div class="field">
                    <span class="label">📦 Modo de Entrega</span>
                    <div class="badge-modo">
                        ${modo === 'Envio' ? '🛵 ENVÍO A DOMICILIO' : '🛍️ RETIRO EN LOCAL'}
                    </div>
                    ${etiquetaTexto ? `<div>${etiquetaTexto}</div>` : ''}
                </div>
                
                ${modo === 'Envio' ? `
                    <div class="field">
                        <span class="label">📍 Dirección Envío</span>
                        <span class="value">${direccion || '-'}</span>
                    </div>
                    <div class="field">
                        <span class="label">🕒 Horario</span>
                        <span class="value">${horario || '-'}</span>
                    </div>
                ` : ''}

                <div class="total-box">
                    <div>
                        <div class="total-title">Total a Cobrar</div>
                        ${subtituloMonto ? `<div style="font-size: 9px; color: #64748b;">${subtituloMonto}</div>` : ''}
                    </div>
                    <div class="total-monto">$${parseFloat(montoMostrar || 0).toFixed(2)}</div>
                </div>
                
                <div class="footer">
                    <div class="footer-item">
                        <img src="/logos/instagram.png" class="icon-img" alt="IG" onerror="this.src='https://cdn-icons-png.flaticon.com/512/2111/2111463.png'">
                        <span>${igAccount}</span>
                    </div>
                    <div class="footer-item">
                        <img src="/logos/ubicacion.png" class="icon-img" alt="Ubicación" onerror="this.src='https://cdn-icons-png.flaticon.com/512/535/535239.png'">
                        <span>${direccionLocal}</span>
                    </div>
                </div>
            </div>
            <script>
                window.onload = function() { 
                    setTimeout(function() {
                        window.print(); 
                    }, 300);
                }
            </script>
        </body>
        </html>
    `);
}

// ==========================================
// MÓDULO DE GESTIÓN DE USUARIOS (Solo npanadisi)
// ==========================================
let listaUsuariosEnMemoria = [];
let usuarioEnEdicion = null;

function abrirModalUsuarios() {
    cambiarSeccion('usuarios');
}

function cerrarModalUsuarios() {
    cambiarSeccion('nueva');
}

async function cargarListaUsuarios() {
    const container = document.getElementById('listaUsuariosContainer');
    if (!container) return;
    container.innerHTML = '<p class="text-xs text-slate-400 italic p-3 text-center">Cargando lista de usuarios...</p>';

    try {
        const res = await fetch(`/api/usuarios`);
        if (!res.ok) throw new Error('No se pudo cargar la lista');

        const usuarios = await res.json();
        listaUsuariosEnMemoria = usuarios || [];

        if (listaUsuariosEnMemoria.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 italic p-3 text-center">No hay usuarios registrados.</p>';
            return;
        }

        container.innerHTML = listaUsuariosEnMemoria.map(u => {
            const esEsteAdmin = (u.username || '').toLowerCase() === 'npanadisi';
            
            // Resumen de permisos Panatech
            const panaHabilitado = u.panatech && u.panatech.habilitado;
            const panaPermisos = [];
            if (panaHabilitado) {
                if (u.panatech.permisos?.nueva_orden) panaPermisos.push('Nueva');
                if (u.panatech.permisos?.busqueda) panaPermisos.push('Buscar');
                if (u.panatech.permisos?.stock) panaPermisos.push('Stock');
                if (u.panatech.permisos?.informes) panaPermisos.push('Informes');
            }

            // Resumen de permisos Incanto
            const incaHabilitado = u.incanto && u.incanto.habilitado;
            const incaPermisos = [];
            if (incaHabilitado) {
                if (u.incanto.permisos?.nueva_orden) incaPermisos.push('Nueva');
                if (u.incanto.permisos?.busqueda) incaPermisos.push('Buscar');
                if (u.incanto.permisos?.stock) incaPermisos.push('Stock');
                if (u.incanto.permisos?.informes) incaPermisos.push('Informes');
                if (u.incanto.permisos?.mayorista) incaPermisos.push('Mayorista');
            }

            return `
                <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-black text-white">👤 ${u.username}</span>
                            ${esEsteAdmin ? '<span class="text-[9px] bg-violet-900/60 text-violet-300 border border-violet-600/40 px-2 py-0.5 rounded-full font-bold">Admin</span>' : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[10px]">
                            <!-- Panatech pill -->
                            <span class="px-2 py-0.5 rounded-md font-semibold ${panaHabilitado ? 'bg-sky-950 text-sky-300 border border-sky-600/30' : 'bg-slate-800 text-slate-500 line-through'}">
                                🔵 Panatech: ${panaHabilitado ? panaPermisos.join(', ') || 'Sin menús' : 'Deshabilitado'}
                            </span>
                            <!-- Incanto pill -->
                            <span class="px-2 py-0.5 rounded-md font-semibold ${incaHabilitado ? 'bg-rose-950 text-rose-300 border border-rose-600/30' : 'bg-slate-800 text-slate-500 line-through'}">
                                🌸 Incanto: ${incaHabilitado ? incaPermisos.join(', ') || 'Sin menús' : 'Deshabilitado'}
                            </span>
                        </div>
                    </div>

                    <div class="flex items-center gap-1.5 self-end sm:self-center">
                        <button type="button" onclick="editarUsuario('${u.username}')" class="bg-slate-800 hover:bg-slate-700 text-violet-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-700 transition">
                            ✏️ Editar
                        </button>
                        ${!esEsteAdmin ? `
                            <button type="button" onclick="eliminarUsuario('${u.username}')" class="bg-rose-950/60 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded-lg text-xs font-bold border border-rose-800/40 transition">
                                🗑️ Eliminar
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p class="text-xs text-rose-400 p-3 text-center">Error al cargar la lista de usuarios.</p>';
    }
}

function mostrarFormularioNuevoUsuario() {
    usuarioEnEdicion = null;
    document.getElementById('formUsuarioTitulo').textContent = 'Crear Nuevo Usuario';
    document.getElementById('usrUsername').value = '';
    document.getElementById('usrUsername').removeAttribute('readonly');
    document.getElementById('usrPassword').value = '';

    // Marcar Panatech habilitado por defecto con menús básicos
    document.getElementById('usrHabilitadoPanatech').checked = true;
    document.getElementById('p_pana_nueva').checked = true;
    document.getElementById('p_pana_busqueda').checked = true;
    document.getElementById('p_pana_stock').checked = true;
    document.getElementById('p_pana_informes').checked = false;

    // Incanto deshabilitado por defecto
    document.getElementById('usrHabilitadoIncanto').checked = false;
    document.getElementById('p_inca_nueva').checked = false;
    document.getElementById('p_inca_busqueda').checked = false;
    document.getElementById('p_inca_stock').checked = false;
    document.getElementById('p_inca_informes').checked = false;
    document.getElementById('p_inca_mayorista').checked = false;

    togglePermisosMarca('panatech');
    togglePermisosMarca('incanto');

    document.getElementById('formUsuarioContainer').classList.remove('hidden');
    document.getElementById('formUsuarioContainer').scrollIntoView({ behavior: 'smooth' });
}

function cancelarEdicionUsuario() {
    usuarioEnEdicion = null;
    const form = document.getElementById('formUsuarioContainer');
    if (form) form.classList.add('hidden');
}

function togglePermisosMarca(marca) {
    if (marca === 'panatech') {
        const activo = document.getElementById('usrHabilitadoPanatech').checked;
        const container = document.getElementById('permisosPanatechContainer');
        if (container) {
            container.style.opacity = activo ? '1' : '0.4';
            container.style.pointerEvents = activo ? 'auto' : 'none';
        }
    } else if (marca === 'incanto') {
        const activo = document.getElementById('usrHabilitadoIncanto').checked;
        const container = document.getElementById('permisosIncantoContainer');
        if (container) {
            container.style.opacity = activo ? '1' : '0.4';
            container.style.pointerEvents = activo ? 'auto' : 'none';
        }
    }
}

function editarUsuario(username) {
    const u = listaUsuariosEnMemoria.find(x => x.username === username);
    if (!u) return;

    usuarioEnEdicion = u.username;
    document.getElementById('formUsuarioTitulo').textContent = `Editar Usuario: ${u.username}`;
    
    const inputUsr = document.getElementById('usrUsername');
    inputUsr.value = u.username;
    if (u.username.toLowerCase() === 'npanadisi') {
        inputUsr.setAttribute('readonly', 'true');
    } else {
        inputUsr.removeAttribute('readonly');
    }

    document.getElementById('usrPassword').value = u.password || '';

    // Cargar Panatech
    const panaHab = !!(u.panatech && u.panatech.habilitado);
    document.getElementById('usrHabilitadoPanatech').checked = panaHab;
    document.getElementById('p_pana_nueva').checked = !!u.panatech?.permisos?.nueva_orden;
    document.getElementById('p_pana_busqueda').checked = !!u.panatech?.permisos?.busqueda;
    document.getElementById('p_pana_stock').checked = !!u.panatech?.permisos?.stock;
    document.getElementById('p_pana_informes').checked = !!u.panatech?.permisos?.informes;

    // Cargar Incanto
    const incaHab = !!(u.incanto && u.incanto.habilitado);
    document.getElementById('usrHabilitadoIncanto').checked = incaHab;
    document.getElementById('p_inca_nueva').checked = !!u.incanto?.permisos?.nueva_orden;
    document.getElementById('p_inca_busqueda').checked = !!u.incanto?.permisos?.busqueda;
    document.getElementById('p_inca_stock').checked = !!u.incanto?.permisos?.stock;
    document.getElementById('p_inca_informes').checked = !!u.incanto?.permisos?.informes;
    document.getElementById('p_inca_mayorista').checked = !!u.incanto?.permisos?.mayorista;

    togglePermisosMarca('panatech');
    togglePermisosMarca('incanto');

    document.getElementById('formUsuarioContainer').classList.remove('hidden');
    document.getElementById('formUsuarioContainer').scrollIntoView({ behavior: 'smooth' });
}

async function guardarUsuarioForm() {
    const username = document.getElementById('usrUsername').value.trim();
    const password = document.getElementById('usrPassword').value.trim();

    if (!username || !password) {
        showToast('El usuario y la contraseña son obligatorios.', 'warning');
        return;
    }

    const habPanatech = document.getElementById('usrHabilitadoPanatech').checked;
    const habIncanto = document.getElementById('usrHabilitadoIncanto').checked;

    if (!habPanatech && !habIncanto) {
        showToast('Debés habilitar al menos un emprendimiento (Panatech o Incanto).', 'warning');
        return;
    }

    const payload = {
        usuario: {
            username,
            password,
            panatech: {
                habilitado: habPanatech,
                permisos: {
                    nueva_orden: habPanatech && document.getElementById('p_pana_nueva').checked,
                    busqueda: habPanatech && document.getElementById('p_pana_busqueda').checked,
                    stock: habPanatech && document.getElementById('p_pana_stock').checked,
                    informes: habPanatech && document.getElementById('p_pana_informes').checked
                }
            },
            incanto: {
                habilitado: habIncanto,
                permisos: {
                    nueva_orden: habIncanto && document.getElementById('p_inca_nueva').checked,
                    busqueda: habIncanto && document.getElementById('p_inca_busqueda').checked,
                    stock: habIncanto && document.getElementById('p_inca_stock').checked,
                    informes: habIncanto && document.getElementById('p_inca_informes').checked,
                    mayorista: habIncanto && document.getElementById('p_inca_mayorista').checked
                }
            }
        }
    };

    try {
        const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Usuario ${username} guardado exitosamente.`, 'success');
            cancelarEdicionUsuario();
            cargarListaUsuarios();
            // Si nos editamos a nosotros mismos, recargar permisos
            if (username.toLowerCase() === (USUARIO_ACTUAL || '').toLowerCase()) {
                cargarPermisosUsuario();
            }
        } else {
            showToast('Error: ' + (data.error || 'No se pudo guardar'), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al guardar usuario.', 'error');
    }
}

async function eliminarUsuario(username) {
    if (!confirm(`¿Estás seguro de que querés eliminar al usuario "${username}"?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/usuarios/${encodeURIComponent(username)}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (data.success) {
            showToast(`Usuario ${username} eliminado.`, 'info');
            cancelarEdicionUsuario();
            cargarListaUsuarios();
        } else {
            showToast('Error: ' + (data.error || 'No se pudo eliminar'), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al eliminar usuario.', 'error');
    }
}

// ==========================================
// MÓDULO INCANTO MAYORISTA (JS)
// ==========================================
let cotizacionDolarMep = 1540;
let modoMonedaMayorista = 'ARS'; // 'ARS' o 'USD'
let metricasMayoristaMemoria = { ventasMes: 0, cantidadSplash: 0, valorEstimado: 0 };
let productosMayoristaMemoria = []; // Stock Mayorista (marca: incanto_mayorista)
let catalogoOrigenIncantoMemoria = []; // Catálogo completo de Incanto para elegir al comprar
let transaccionesMayoristaMemoria = [];

let carritoVentaMayorista = [];
let carritoCompraMayorista = [];
let filtroTextoStockMayorista = '';

async function inicializarModuloMayorista() {
    await Promise.all([
        cargarCotizacionMep(),
        cargarMetricasMayorista(),
        cargarProductosMayorista(),
        cargarCatalogoOrigenMayorista(),
        cargarTransaccionesMayorista()
    ]);
}

// Cargar Dólar MEP
async function cargarCotizacionMep(forzarAlerta = false) {
    const display = document.getElementById('valorDolarMepDisplay');
    try {
        const res = await fetch('/api/dolar/mep');
        const data = await res.json();
        cotizacionDolarMep = parseFloat(data.venta || data.mep) || 1540;
        if (display) {
            display.textContent = `$${cotizacionDolarMep.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (forzarAlerta) {
            showToast(`Cotización MEP actualizada: $${cotizacionDolarMep.toFixed(2)}`, 'info');
            actualizarValorEstimadoDisplay();
        }
    } catch (err) {
        console.error('Error al obtener MEP:', err);
        if (display) display.textContent = `$${cotizacionDolarMep.toFixed(2)}`;
    }
}

// Cargar Métricas (Ventas del mes, Cantidad Splash, Valor estimado)
async function cargarMetricasMayorista() {
    try {
        const res = await fetch('/api/mayorista/metricas');
        const data = await res.json();
        metricasMayoristaMemoria = data || { ventasMes: 0, cantidadSplash: 0, valorEstimado: 0 };

        // 1. Ventas del mes
        const elVentas = document.getElementById('kpiMayoristaVentasMes');
        if (elVentas) {
            elVentas.textContent = `$${(parseFloat(data.ventasMes) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // 2. Cantidad de Splash
        const elSplash = document.getElementById('kpiMayoristaSplash');
        if (elSplash) {
            elSplash.textContent = `${data.cantidadSplash || 0} un.`;
        }

        // 3. Valor estimado ($ / u$d)
        actualizarValorEstimadoDisplay();
    } catch (err) {
        console.error('Error al cargar métricas mayorista:', err);
    }
}

// Alternar entre $ y u$d con el botón de flechitas ⇄
function alternarMonedaMayorista() {
    modoMonedaMayorista = (modoMonedaMayorista === 'ARS') ? 'USD' : 'ARS';
    actualizarValorEstimadoDisplay();
}

function actualizarValorEstimadoDisplay() {
    const label = document.getElementById('kpiMayoristaValorLabel');
    const monto = document.getElementById('kpiMayoristaValorMonto');
    const sub = document.getElementById('kpiMayoristaValorSub');
    if (!label || !monto) return;

    const valorArs = parseFloat(metricasMayoristaMemoria.valorEstimado) || 0;

    if (modoMonedaMayorista === 'ARS') {
        label.textContent = 'Valor estimado en $';
        monto.textContent = `$${valorArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (sub) sub.textContent = 'Inventario mayorista total';
    } else {
        const mepVal = cotizacionDolarMep > 0 ? cotizacionDolarMep : 1540;
        const valorUsd = valorArs / mepVal;
        label.textContent = 'Valor estimado en u$d';
        monto.textContent = `u$d ${valorUsd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (sub) sub.textContent = `Cotización MEP: $${mepVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    }
}

// Cargar Stock Mayorista propio (`incanto_mayorista`) y renderizar el módulo Stock Mayorista
async function cargarProductosMayorista() {
    try {
        const res = await fetch('/api/mayorista/productos');
        const data = await res.json();
        productosMayoristaMemoria = Array.isArray(data) ? data : [];
        renderizarStockMayoristaModulo();
    } catch (err) {
        console.error('Error al cargar stock mayorista:', err);
    }
}

// Cargar catálogo base de productos de Incanto para el selector de Compras Mayoristas
async function cargarCatalogoOrigenMayorista() {
    try {
        const res = await fetch('/api/mayorista/catalogo-origen');
        const data = await res.json();
        catalogoOrigenIncantoMemoria = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('Error al cargar catálogo origen Incanto:', err);
    }
}

function filtrarVistaStockMayorista(val) {
    filtroTextoStockMayorista = (val || '').trim().toLowerCase();
    renderizarStockMayoristaModulo();
}

function renderizarStockMayoristaModulo() {
    const grid = document.getElementById('contenedorStockMayoristaGrid');
    const badge = document.getElementById('badgeCountStockMayorista');
    if (!grid) return;

    const conStockTotal = productosMayoristaMemoria.reduce((acc, p) => acc + (parseInt(p.stock) || 0), 0);
    if (badge) {
        badge.textContent = `${productosMayoristaMemoria.length} prod. (${conStockTotal} un.)`;
    }

    let filtrados = productosMayoristaMemoria;
    if (filtroTextoStockMayorista) {
        filtrados = filtrados.filter(p =>
            (p.nombre || '').toLowerCase().includes(filtroTextoStockMayorista) ||
            (p.codigo_sku || '').toLowerCase().includes(filtroTextoStockMayorista)
        );
    }

    if (filtrados.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-6 text-center text-xs text-slate-400 italic bg-slate-900/50 rounded-xl border border-slate-800">
                ${productosMayoristaMemoria.length === 0
                    ? 'Aún no hay productos cargados en el Stock Mayorista. Registrá una Compra Mayorista abajo para sumar stock.'
                    : 'No se encontraron productos en el Stock Mayorista con ese filtro.'}
            </div>
        `;
        return;
    }

    grid.innerHTML = filtrados.map(p => {
        const stock = parseInt(p.stock) || 0;
        const precio = parseFloat(p.precio) || 0;
        const badgeColor = stock > 0
            ? 'bg-emerald-950/90 text-emerald-400 border-emerald-700/60'
            : 'bg-rose-950/90 text-rose-400 border-rose-700/60';

        return `
            <div class="bg-slate-900/90 border border-slate-700/70 hover:border-pink-500/40 p-2.5 rounded-xl flex items-center justify-between gap-2.5 text-xs transition shadow-sm">
                <div class="flex items-center gap-2.5 min-w-0">
                    <img src="${p.imagen_url || '/img/no-image.svg'}" onerror="this.onerror=null;this.src='/img/no-image.svg';" class="w-10 h-10 rounded-lg object-contain bg-slate-950 border border-slate-800 shrink-0">
                    <div class="min-w-0">
                        <strong class="text-white block truncate" title="${escapeHtml(p.nombre)}">${escapeHtml(p.nombre)}</strong>
                        <span class="text-[10px] text-slate-400 block">Ref: <b class="text-emerald-400">$${precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</b></span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="px-2 py-1 rounded-lg border text-[11px] font-black ${badgeColor}">
                        ${stock} un.
                    </span>
                    <button type="button" onclick="seleccionarRapidoDesdeStockMayorista(${p.id})" title="Vender este producto" class="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 p-1.5 rounded-lg text-[11px] transition">
                        🛍️
                    </button>
                    <button type="button" onclick="eliminarProductoStockMayorista(${p.id}, '${escapeHtml(p.nombre)}')" title="Quitar del Stock Mayorista" class="bg-slate-800 hover:bg-rose-900/80 text-slate-400 hover:text-rose-200 border border-slate-700 p-1.5 rounded-lg text-[11px] transition">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function seleccionarRapidoDesdeStockMayorista(id) {
    const prod = productosMayoristaMemoria.find(p => String(p.id) === String(id));
    if (!prod) return;
    seleccionarProductoMayorista('venta', prod.id, prod.nombre, prod.precio || 0, prod.stock || 0);
    document.getElementById('mayVentaCantidad')?.focus();
    showToast(`Producto "${prod.nombre}" seleccionado para la venta.`, 'info');
}

async function eliminarProductoStockMayorista(id, nombre) {
    if (!confirm(`¿Seguro que querés quitar "${nombre}" del Stock Mayorista?`)) return;
    try {
        const res = await fetch(`/api/mayorista/productos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Producto eliminado del Stock Mayorista.', 'info');
            await cargarProductosMayorista();
            await cargarMetricasMayorista();
        } else {
            showToast('Error: ' + (data.error || 'No se pudo eliminar'), 'error');
        }
    } catch (err) {
        showToast('Error de red al eliminar producto.', 'error');
    }
}

// Autocompletado de productos:
// - En VENTA ('venta'): utiliza exclusivamente el Stock Mayorista (`productosMayoristaMemoria`)
// - En COMPRA ('compra'): permite elegir todos los productos de Incanto (`catalogoOrigenIncantoMemoria`) o escribir uno nuevo
function filtrarProductosMayorista(tipo, texto) {
    const query = (texto || '').toLowerCase().trim();
    const contenedorId = tipo === 'venta' ? 'sugerenciasMayVenta' : 'sugerenciasMayCompra';
    const container = document.getElementById(contenedorId);
    if (!container) return;

    const hiddenId = tipo === 'venta' ? document.getElementById('mayVentaProductoId') : document.getElementById('mayCompraProductoId');
    if (hiddenId) hiddenId.value = '';

    if (tipo === 'venta') {
        // Para Venta: filtrar del Stock Mayorista
        const lista = query
            ? productosMayoristaMemoria.filter(p =>
                (p.nombre || '').toLowerCase().includes(query) ||
                (p.codigo_sku || '').toLowerCase().includes(query)
            )
            : productosMayoristaMemoria.slice(0, 30);

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="p-3 text-xs text-slate-400 italic text-center">
                    No hay productos coincidentes en el <b>Stock Mayorista</b>.<br>
                    Cargalos primero en "Compra Mayorista".
                </div>
            `;
            container.classList.remove('hidden');
            return;
        }

        container.innerHTML = lista.slice(0, 30).map(p => `
            <div onclick="seleccionarProductoMayorista('venta', ${p.id}, '${escapeHtml(p.nombre)}', ${p.precio || 0}, ${p.stock || 0})" class="p-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-b-0 flex justify-between items-center gap-2 text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${p.imagen_url || '/img/no-image.svg'}" onerror="this.onerror=null;this.src='/img/no-image.svg';" class="w-8 h-8 rounded object-contain bg-slate-950 border border-slate-800 shrink-0">
                    <div class="min-w-0">
                        <strong class="text-white block truncate">${escapeHtml(p.nombre)}</strong>
                        <span class="text-[10px] text-slate-400">Stock Mayorista: <span class="${(p.stock || 0) > 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${p.stock || 0} un.</span></span>
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <span class="text-xs font-bold text-rose-400">$${(parseFloat(p.precio) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>
        `).join('');
        container.classList.remove('hidden');
    } else {
        // Para Compra: buscar en el catálogo completo de Incanto (y Stock Mayorista)
        if (!query && catalogoOrigenIncantoMemoria.length === 0) {
            container.classList.add('hidden');
            return;
        }

        const fuente = catalogoOrigenIncantoMemoria.length > 0 ? catalogoOrigenIncantoMemoria : productosMayoristaMemoria;
        const coincidencias = query
            ? fuente.filter(p =>
                (p.nombre || '').toLowerCase().includes(query) ||
                (p.codigo_sku || '').toLowerCase().includes(query)
            ).slice(0, 35)
            : fuente.slice(0, 25);

        if (coincidencias.length === 0) {
            container.innerHTML = `
                <div class="p-2.5 text-xs text-emerald-300 italic">
                    ✨ Producto nuevo: se agregará al Stock Mayorista al registrar la compra.
                </div>
            `;
            container.classList.remove('hidden');
            return;
        }

        container.innerHTML = coincidencias.map(p => {
            const idMay = p.mayorista_id || p.id || '';
            const precioRef = parseFloat(p.precio_referencia !== undefined ? p.precio_referencia : p.precio) || 0;
            const stockMay = parseInt(p.stock_mayorista !== undefined ? p.stock_mayorista : p.stock) || 0;
            return `
                <div onclick="seleccionarProductoMayorista('compra', '${idMay}', '${escapeHtml(p.nombre)}', ${precioRef}, ${stockMay})" class="p-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800 last:border-b-0 flex justify-between items-center gap-2 text-xs">
                    <div class="flex items-center gap-2 min-w-0">
                        <img src="${p.imagen_url || '/img/no-image.svg'}" onerror="this.onerror=null;this.src='/img/no-image.svg';" class="w-8 h-8 rounded object-contain bg-slate-950 border border-slate-800 shrink-0">
                        <div class="min-w-0">
                            <strong class="text-white block truncate">${escapeHtml(p.nombre)}</strong>
                            <span class="text-[10px] text-slate-400">En Stock Mayorista: <span class="text-pink-400 font-bold">${stockMay} un.</span></span>
                        </div>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="text-[10px] text-slate-400 block">Precio Ref.</span>
                        <span class="text-xs font-bold text-emerald-400">$${precioRef.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            `;
        }).join('');
        container.classList.remove('hidden');
    }
}

function seleccionarProductoMayorista(tipo, id, nombre, precio, stock) {
    const pref = tipo === 'venta' ? 'mayVenta' : 'mayCompra';
    const inputNombre = document.getElementById(`${pref}Producto`);
    const inputId = document.getElementById(`${pref}ProductoId`);
    const inputCant = document.getElementById(`${pref}Cantidad`);
    const inputUnitario = document.getElementById(`${pref}PrecioUnitario`);
    const inputImporte = document.getElementById(`${pref}Importe`);
    const contenedorId = tipo === 'venta' ? 'sugerenciasMayVenta' : 'sugerenciasMayCompra';

    if (inputNombre) inputNombre.value = nombre;
    if (inputId) inputId.value = id || '';

    const cant = Math.max(1, parseInt(inputCant?.value) || 1);
    const unit = parseFloat(precio) || 0;

    if (inputUnitario && unit > 0) {
        inputUnitario.value = unit.toFixed(2);
    }
    if (inputImporte && unit > 0) {
        inputImporte.value = (unit * cant).toFixed(2);
    }

    document.getElementById(contenedorId)?.classList.add('hidden');
}

// Cerrar desplegables de sugerencias y búsqueda al hacer clic fuera
document.addEventListener('click', (e) => {
    const prodRes = document.getElementById('prodResults');
    const prodInp = document.getElementById('prodSearch');
    if (prodRes && !prodRes.contains(e.target) && e.target !== prodInp) {
        prodRes.classList.add('hidden');
    }
    const sugVenta = document.getElementById('sugerenciasMayVenta');
    const inpVenta = document.getElementById('mayVentaProducto');
    if (sugVenta && !sugVenta.contains(e.target) && e.target !== inpVenta) {
        sugVenta.classList.add('hidden');
    }
    const sugCompra = document.getElementById('sugerenciasMayCompra');
    const inpCompra = document.getElementById('mayCompraProducto');
    if (sugCompra && !sugCompra.contains(e.target) && e.target !== inpCompra) {
        sugCompra.classList.add('hidden');
    }
});

// Recalcular automáticamente Importe Total = Cantidad * Importe por Unidad
function recalcularSubtotalItemMayorista(tipo) {
    const pref = tipo === 'venta' ? 'mayVenta' : 'mayCompra';
    const cant = Math.max(1, parseInt(document.getElementById(`${pref}Cantidad`)?.value) || 1);
    const unit = parseFloat(document.getElementById(`${pref}PrecioUnitario`)?.value);
    const inputTotal = document.getElementById(`${pref}Importe`);

    if (!isNaN(unit) && unit >= 0 && inputTotal) {
        inputTotal.value = (cant * unit).toFixed(2);
    }
}

// Si el usuario escribe directamente el Importe Total, calcular el Importe por Unidad
function recalcularUnitarioDesdeTotalMayorista(tipo) {
    const pref = tipo === 'venta' ? 'mayVenta' : 'mayCompra';
    const cant = Math.max(1, parseInt(document.getElementById(`${pref}Cantidad`)?.value) || 1);
    const total = parseFloat(document.getElementById(`${pref}Importe`)?.value);
    const inputUnit = document.getElementById(`${pref}PrecioUnitario`);

    if (!isNaN(total) && total >= 0 && inputUnit) {
        inputUnit.value = (total / cant).toFixed(2);
    }
}

// Agregar un producto a la lista de la Venta o Compra actual
function agregarItemCarritoMayorista(tipo) {
    const pref = tipo === 'venta' ? 'mayVenta' : 'mayCompra';
    const inputNombre = document.getElementById(`${pref}Producto`);
    const inputId = document.getElementById(`${pref}ProductoId`);
    const inputCant = document.getElementById(`${pref}Cantidad`);
    const inputUnit = document.getElementById(`${pref}PrecioUnitario`);
    const inputTotal = document.getElementById(`${pref}Importe`);

    const nombre = (inputNombre?.value || '').trim();
    const prodId = inputId?.value || null;
    const cantidad = Math.max(1, parseInt(inputCant?.value) || 1);
    let precioUnitario = parseFloat(inputUnit?.value) || 0;
    let subtotal = parseFloat(inputTotal?.value) || 0;

    if (!nombre) {
        showToast('Seleccioná o escribí un producto primero.', 'warning');
        inputNombre?.focus();
        return false;
    }

    if (precioUnitario > 0 && subtotal <= 0) {
        subtotal = cantidad * precioUnitario;
    } else if (subtotal > 0 && precioUnitario <= 0) {
        precioUnitario = subtotal / cantidad;
    }

    if (subtotal <= 0) {
        showToast('Ingresá el Importe por Unidad o el Importe Total.', 'warning');
        inputUnit?.focus();
        return false;
    }

    // Si es Venta, verificar que el producto exista en Stock Mayorista
    let idFinal = prodId;
    if (tipo === 'venta' && !idFinal) {
        const matchStock = productosMayoristaMemoria.find(p => (p.nombre || '').toLowerCase().trim() === nombre.toLowerCase());
        if (matchStock) {
            idFinal = matchStock.id;
        } else {
            showToast('Elegí un producto disponible en el Stock Mayorista.', 'warning');
            return false;
        }
    }

    const listaTarget = tipo === 'venta' ? carritoVentaMayorista : carritoCompraMayorista;

    // Si ya estaba el mismo producto en la lista, sumar cantidad y subtotal
    const idxExist = listaTarget.findIndex(it =>
        (idFinal && String(it.producto_id) === String(idFinal)) ||
        it.producto_nombre.toLowerCase() === nombre.toLowerCase()
    );

    if (idxExist >= 0) {
        listaTarget[idxExist].cantidad += cantidad;
        listaTarget[idxExist].subtotal += subtotal;
        listaTarget[idxExist].precio_unitario = listaTarget[idxExist].subtotal / listaTarget[idxExist].cantidad;
    } else {
        listaTarget.push({
            producto_id: idFinal,
            producto_nombre: nombre,
            cantidad,
            precio_unitario: precioUnitario,
            subtotal
        });
    }

    // Limpiar inputs de ítem para poder agregar otro producto
    if (inputNombre) inputNombre.value = '';
    if (inputId) inputId.value = '';
    if (inputCant) inputCant.value = 1;
    if (inputUnit) inputUnit.value = '';
    if (inputTotal) inputTotal.value = '';

    renderizarCarritoMayorista(tipo);
    inputNombre?.focus();
    return true;
}

function quitarItemCarritoMayorista(tipo, idx) {
    if (tipo === 'venta') {
        carritoVentaMayorista.splice(idx, 1);
    } else {
        carritoCompraMayorista.splice(idx, 1);
    }
    renderizarCarritoMayorista(tipo);
}

function actualizarCantidadItemCarritoMayorista(tipo, idx, nuevaCant) {
    const lista = tipo === 'venta' ? carritoVentaMayorista : carritoCompraMayorista;
    if (!lista[idx]) return;
    const cant = Math.max(1, parseInt(nuevaCant) || 1);
    lista[idx].cantidad = cant;
    lista[idx].subtotal = cant * (parseFloat(lista[idx].precio_unitario) || 0);
    renderizarCarritoMayorista(tipo);
}

function actualizarUnitarioItemCarritoMayorista(tipo, idx, nuevoUnit) {
    const lista = tipo === 'venta' ? carritoVentaMayorista : carritoCompraMayorista;
    if (!lista[idx]) return;
    const unit = Math.max(0, parseFloat(nuevoUnit) || 0);
    lista[idx].precio_unitario = unit;
    lista[idx].subtotal = (parseInt(lista[idx].cantidad) || 1) * unit;
    renderizarCarritoMayorista(tipo);
}

function renderizarCarritoMayorista(tipo) {
    const esVenta = tipo === 'venta';
    const lista = esVenta ? carritoVentaMayorista : carritoCompraMayorista;
    const contenedor = document.getElementById(esVenta ? 'contenedorItemsVentaMayorista' : 'contenedorItemsCompraMayorista');
    const listaDom = document.getElementById(esVenta ? 'listaCarritoVentaMayorista' : 'listaCarritoCompraMayorista');
    const resumenDom = document.getElementById(esVenta ? 'resumenTotalVentaMayorista' : 'resumenTotalCompraMayorista');

    if (!contenedor || !listaDom) return;

    if (lista.length === 0) {
        contenedor.classList.add('hidden');
        listaDom.innerHTML = '';
        if (resumenDom) resumenDom.textContent = 'Total: $0.00';
        return;
    }

    contenedor.classList.remove('hidden');
    const totalGral = lista.reduce((acc, it) => acc + (parseFloat(it.subtotal) || 0), 0);
    if (resumenDom) {
        resumenDom.textContent = `Total (${lista.length} prod.): $${totalGral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    listaDom.innerHTML = lista.map((it, idx) => `
        <div class="bg-slate-950/90 border border-slate-800 px-2.5 py-2 rounded-lg flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-xs">
            <div class="min-w-0 flex-1">
                <strong class="text-white block truncate">${escapeHtml(it.producto_nombre)}</strong>
                <span class="text-[10px] text-slate-400">
                    ${it.cantidad} un. × $${(parseFloat(it.precio_unitario) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} c/u
                </span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <input type="number" min="1" value="${it.cantidad}" onchange="actualizarCantidadItemCarritoMayorista('${tipo}', ${idx}, this.value)" class="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-xs text-white" title="Cantidad">
                <input type="number" step="0.01" value="${(parseFloat(it.precio_unitario) || 0).toFixed(2)}" onchange="actualizarUnitarioItemCarritoMayorista('${tipo}', ${idx}, this.value)" class="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-right text-xs text-white" title="Importe por unidad">
                <span class="font-bold ${esVenta ? 'text-rose-400' : 'text-emerald-400'} min-w-[80px] text-right">
                    $${(parseFloat(it.subtotal) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
                <button type="button" onclick="quitarItemCarritoMayorista('${tipo}', ${idx})" class="text-slate-400 hover:text-rose-400 font-bold px-1.5" title="Quitar producto">✕</button>
            </div>
        </div>
    `).join('');
}

// Registrar o Editar Venta Mayorista
async function guardarVentaMayorista(e) {
    e.preventDefault();
    const cliente = document.getElementById('mayVentaCliente').value.trim();
    const editId = document.getElementById('mayVentaEditOrdenId')?.value || '';

    // Si el usuario dejó un producto cargado en los inputs sin apretar "+", lo sumamos automáticamente
    const prodInputPendiente = (document.getElementById('mayVentaProducto')?.value || '').trim();
    const importePendiente = parseFloat(document.getElementById('mayVentaImporte')?.value) || 0;
    const unitPendiente = parseFloat(document.getElementById('mayVentaPrecioUnitario')?.value) || 0;
    if (prodInputPendiente && (importePendiente > 0 || unitPendiente > 0)) {
        const ok = agregarItemCarritoMayorista('venta');
        if (!ok) return;
    }

    if (!cliente) {
        showToast('Ingresá el nombre del cliente.', 'warning');
        return;
    }

    if (carritoVentaMayorista.length === 0) {
        showToast('Agregá al menos un producto del Stock Mayorista a la venta.', 'warning');
        return;
    }

    const btn = document.getElementById('btnGuardarVentaMay');
    if (btn) btn.disabled = true;

    try {
        const url = editId ? `/api/mayorista/transacciones/${editId}` : '/api/mayorista/ventas';
        const method = editId ? 'PUT' : 'POST';
        const payload = editId
            ? { persona: cliente, items: carritoVentaMayorista, vendedor: USUARIO_ACTUAL }
            : { cliente, items: carritoVentaMayorista, vendedor: USUARIO_ACTUAL };

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showToast(editId ? '¡Venta Mayorista actualizada con éxito!' : `¡Venta Mayorista ${data.numero} registrada!`, 'success');
            cancelarEdicionMayorista('venta');
            await Promise.all([
                cargarMetricasMayorista(),
                cargarProductosMayorista(),
                cargarCatalogoOrigenMayorista(),
                cargarTransaccionesMayorista()
            ]);
        } else {
            showToast('Error: ' + (data.error || 'No se pudo guardar la venta'), 'error');
        }
    } catch (err) {
        showToast('Error de red al guardar la venta.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Registrar o Editar Compra Mayorista
async function guardarCompraMayorista(e) {
    e.preventDefault();
    const proveedor = document.getElementById('mayCompraProveedor').value.trim();
    const editId = document.getElementById('mayCompraEditOrdenId')?.value || '';

    // Si el usuario dejó un producto en los inputs sin apretar "+", agregarlo automáticamente
    const prodInputPendiente = (document.getElementById('mayCompraProducto')?.value || '').trim();
    const importePendiente = parseFloat(document.getElementById('mayCompraImporte')?.value) || 0;
    const unitPendiente = parseFloat(document.getElementById('mayCompraPrecioUnitario')?.value) || 0;
    if (prodInputPendiente && (importePendiente > 0 || unitPendiente > 0)) {
        const ok = agregarItemCarritoMayorista('compra');
        if (!ok) return;
    }

    if (!proveedor) {
        showToast('Ingresá el nombre del proveedor.', 'warning');
        return;
    }

    if (carritoCompraMayorista.length === 0) {
        showToast('Agregá al menos un producto a la compra.', 'warning');
        return;
    }

    const btn = document.getElementById('btnGuardarCompraMay');
    if (btn) btn.disabled = true;

    try {
        const url = editId ? `/api/mayorista/transacciones/${editId}` : '/api/mayorista/compras';
        const method = editId ? 'PUT' : 'POST';
        const payload = editId
            ? { persona: proveedor, items: carritoCompraMayorista, vendedor: USUARIO_ACTUAL }
            : { proveedor, items: carritoCompraMayorista, vendedor: USUARIO_ACTUAL };

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            showToast(editId ? '¡Compra Mayorista actualizada con éxito!' : `¡Compra Mayorista ${data.numero} registrada!`, 'success');
            cancelarEdicionMayorista('compra');
            await Promise.all([
                cargarMetricasMayorista(),
                cargarProductosMayorista(),
                cargarCatalogoOrigenMayorista(),
                cargarTransaccionesMayorista()
            ]);
        } else {
            showToast('Error: ' + (data.error || 'No se pudo guardar la compra'), 'error');
        }
    } catch (err) {
        showToast('Error de red al guardar la compra.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Cargar una Venta o Compra existente en su formulario para editarla
function editarTransaccionMayorista(id) {
    const trans = transaccionesMayoristaMemoria.find(t => String(t.id) === String(id));
    if (!trans) return;

    const esVenta = trans.tipo === 'venta';
    const itemsCopia = (trans.items && trans.items.length > 0)
        ? trans.items.map(it => ({
            producto_id: it.producto_id || null,
            producto_nombre: it.producto_nombre,
            cantidad: parseInt(it.cantidad) || 1,
            precio_unitario: parseFloat(it.precio_unitario) || 0,
            subtotal: parseFloat(it.subtotal) || ((parseInt(it.cantidad) || 1) * (parseFloat(it.precio_unitario) || 0))
        }))
        : [{
            producto_id: null,
            producto_nombre: trans.producto || 'Producto',
            cantidad: parseInt(trans.cantidad) || 1,
            precio_unitario: parseFloat(trans.precio_unitario) || 0,
            subtotal: parseFloat(trans.total) || 0
        }];

    if (esVenta) {
        document.getElementById('mayVentaEditOrdenId').value = trans.id;
        document.getElementById('mayVentaCliente').value = trans.persona || '';
        carritoVentaMayorista = itemsCopia;
        renderizarCarritoMayorista('venta');

        const titulo = document.getElementById('tituloFormVentaMayorista');
        if (titulo) titulo.innerHTML = `✏️ Editando Venta <span class="text-amber-400">${trans.numero}</span>`;
        const txtBtn = document.getElementById('textoBtnGuardarVentaMay');
        if (txtBtn) txtBtn.textContent = 'Guardar Cambios de Venta';
        document.getElementById('btnCancelarEdicionVentaMay')?.classList.remove('hidden');
        document.getElementById('cardFormVentaMayorista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        document.getElementById('mayCompraEditOrdenId').value = trans.id;
        document.getElementById('mayCompraProveedor').value = trans.persona || '';
        carritoCompraMayorista = itemsCopia;
        renderizarCarritoMayorista('compra');

        const titulo = document.getElementById('tituloFormCompraMayorista');
        if (titulo) titulo.innerHTML = `✏️ Editando Compra <span class="text-amber-400">${trans.numero}</span>`;
        const txtBtn = document.getElementById('textoBtnGuardarCompraMay');
        if (txtBtn) txtBtn.textContent = 'Guardar Cambios de Compra';
        document.getElementById('btnCancelarEdicionCompraMay')?.classList.remove('hidden');
        document.getElementById('cardFormCompraMayorista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast(`Editando ${esVenta ? 'venta' : 'compra'} ${trans.numero}`, 'info');
}

function cancelarEdicionMayorista(tipo) {
    if (tipo === 'venta') {
        document.getElementById('formVentaMayorista')?.reset();
        document.getElementById('mayVentaEditOrdenId').value = '';
        document.getElementById('mayVentaProductoId').value = '';
        document.getElementById('mayVentaCantidad').value = 1;
        carritoVentaMayorista = [];
        renderizarCarritoMayorista('venta');

        const titulo = document.getElementById('tituloFormVentaMayorista');
        if (titulo) titulo.textContent = 'Cargar Venta Mayorista';
        const txtBtn = document.getElementById('textoBtnGuardarVentaMay');
        if (txtBtn) txtBtn.textContent = 'Registrar Venta';
        document.getElementById('btnCancelarEdicionVentaMay')?.classList.add('hidden');
    } else {
        document.getElementById('formCompraMayorista')?.reset();
        document.getElementById('mayCompraEditOrdenId').value = '';
        document.getElementById('mayCompraProductoId').value = '';
        document.getElementById('mayCompraCantidad').value = 1;
        carritoCompraMayorista = [];
        renderizarCarritoMayorista('compra');

        const titulo = document.getElementById('tituloFormCompraMayorista');
        if (titulo) titulo.textContent = 'Cargar Compra Mayorista';
        const txtBtn = document.getElementById('textoBtnGuardarCompraMay');
        if (txtBtn) txtBtn.textContent = 'Registrar Compra';
        document.getElementById('btnCancelarEdicionCompraMay')?.classList.add('hidden');
    }
}

async function eliminarTransaccionMayorista(id) {
    const trans = transaccionesMayoristaMemoria.find(t => String(t.id) === String(id));
    const etiqueta = trans ? `${trans.tipo === 'venta' ? 'la venta' : 'la compra'} ${trans.numero} (${trans.persona})` : 'esta operación';
    if (!confirm(`¿Estás seguro de que querés eliminar ${etiqueta}? El Stock Mayorista se ajustará automáticamente.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/mayorista/transacciones/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast(data.mensaje || 'Operación eliminada correctamente.', 'info');
            await Promise.all([
                cargarMetricasMayorista(),
                cargarProductosMayorista(),
                cargarCatalogoOrigenMayorista(),
                cargarTransaccionesMayorista()
            ]);
        } else {
            showToast('Error: ' + (data.error || 'No se pudo eliminar'), 'error');
        }
    } catch (err) {
        showToast('Error de red al eliminar la operación.', 'error');
    }
}

// Cargar y mostrar historial de Ventas y Compras con botones de Editar y Eliminar
async function cargarTransaccionesMayorista() {
    const listVentas = document.getElementById('listaVentasMayorista');
    const listCompras = document.getElementById('listaComprasMayorista');

    try {
        const res = await fetch('/api/mayorista/transacciones?limite=50');
        const data = await res.json();
        transaccionesMayoristaMemoria = Array.isArray(data) ? data : [];

        const ventas = transaccionesMayoristaMemoria.filter(t => t.tipo === 'venta');
        const compras = transaccionesMayoristaMemoria.filter(t => t.tipo === 'compra');

        if (listVentas) {
            if (ventas.length === 0) {
                listVentas.innerHTML = '<p class="text-xs text-slate-400 italic text-center p-3">No hay ventas registradas aún.</p>';
            } else {
                listVentas.innerHTML = ventas.map(v => {
                    const detalleItemsHtml = (Array.isArray(v.items) && v.items.length > 0)
                        ? v.items.map(it => `<span class="inline-block bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 mr-1 mb-1">📦 ${escapeHtml(it.producto_nombre)} × <b>${it.cantidad}</b> ($${(parseFloat(it.precio_unitario) || 0).toLocaleString('es-AR')})</span>`).join('')
                        : `<span>📦 ${escapeHtml(v.producto)} • <strong>${v.cantidad} un.</strong></span>`;

                    return `
                        <div class="bg-slate-900/80 border border-slate-700/70 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:border-rose-500/40 transition">
                            <div class="space-y-1 min-w-0 flex-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-bold text-white">${escapeHtml(v.persona || 'Cliente')}</span>
                                    <span class="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-mono">${v.numero}</span>
                                    <span class="text-[10px] text-slate-400">📅 ${formatearFechaVista(v.fecha)}</span>
                                </div>
                                <div class="text-[11px] text-slate-400 flex flex-wrap pt-0.5">
                                    ${detalleItemsHtml}
                                </div>
                            </div>
                            <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800 shrink-0">
                                <div class="text-left sm:text-right">
                                    <div class="text-xs sm:text-sm font-black text-rose-400">+$${(parseFloat(v.total) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                                    <span class="text-[9px] text-slate-500">${v.vendedor || 'sistema'}</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <button type="button" onclick="editarTransaccionMayorista(${v.id})" class="bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="Editar venta">
                                        ✏️
                                    </button>
                                    <button type="button" onclick="eliminarTransaccionMayorista(${v.id})" class="bg-slate-800 hover:bg-rose-900 text-slate-300 hover:text-rose-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="Eliminar venta">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (listCompras) {
            if (compras.length === 0) {
                listCompras.innerHTML = '<p class="text-xs text-slate-400 italic text-center p-3">No hay compras registradas aún.</p>';
            } else {
                listCompras.innerHTML = compras.map(c => {
                    const detalleItemsHtml = (Array.isArray(c.items) && c.items.length > 0)
                        ? c.items.map(it => `<span class="inline-block bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 mr-1 mb-1">📥 ${escapeHtml(it.producto_nombre)} × <b>${it.cantidad}</b> ($${(parseFloat(it.precio_unitario) || 0).toLocaleString('es-AR')})</span>`).join('')
                        : `<span>📥 ${escapeHtml(c.producto)} • <strong>${c.cantidad} un.</strong></span>`;

                    return `
                        <div class="bg-slate-900/80 border border-slate-700/70 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:border-emerald-500/40 transition">
                            <div class="space-y-1 min-w-0 flex-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-bold text-white">${escapeHtml(c.persona || 'Proveedor')}</span>
                                    <span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">${c.numero}</span>
                                    <span class="text-[10px] text-slate-400">📅 ${formatearFechaVista(c.fecha)}</span>
                                </div>
                                <div class="text-[11px] text-slate-400 flex flex-wrap pt-0.5">
                                    ${detalleItemsHtml}
                                </div>
                            </div>
                            <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800 shrink-0">
                                <div class="text-left sm:text-right">
                                    <div class="text-xs sm:text-sm font-black text-emerald-400">-$${(parseFloat(c.total) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
                                    <span class="text-[9px] text-slate-500">${c.vendedor || 'sistema'}</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    <button type="button" onclick="editarTransaccionMayorista(${c.id})" class="bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="Editar compra">
                                        ✏️
                                    </button>
                                    <button type="button" onclick="eliminarTransaccionMayorista(${c.id})" class="bg-slate-800 hover:bg-rose-900 text-slate-300 hover:text-rose-200 border border-slate-700 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition" title="Eliminar compra">
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (err) {
        console.error('Error al cargar transacciones:', err);
    }
}

// ==========================================
// MODAL REPORTE PDF INCANTO MAYORISTA
// ==========================================
function abrirModalReporteMayorista() {
    const modal = document.getElementById('modalExportarMayorista');
    if (!modal) return;
    
    // Inicializar fechas por defecto (este mes)
    const hoyStr = new Date().toISOString().split('T')[0];
    const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const inputInicio = document.getElementById('exportMayFechaInicio');
    const inputFin = document.getElementById('exportMayFechaFin');
    if (inputInicio && !inputInicio.value) inputInicio.value = primerDiaMes;
    if (inputFin && !inputFin.value) inputFin.value = hoyStr;

    modal.classList.remove('hidden');
}

function cerrarModalReporteMayorista() {
    const modal = document.getElementById('modalExportarMayorista');
    if (modal) modal.classList.add('hidden');
}

function setPresetExportMayorista(tipo) {
    const hoyStr = new Date().toISOString().split('T')[0];
    const inputInicio = document.getElementById('exportMayFechaInicio');
    const inputFin = document.getElementById('exportMayFechaFin');
    if (!inputInicio || !inputFin) return;

    if (tipo === 'hoy') {
        inputInicio.value = hoyStr;
        inputFin.value = hoyStr;
    } else if (tipo === 'mes') {
        const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        inputInicio.value = primerDiaMes;
        inputFin.value = hoyStr;
    } else if (tipo === 'todo') {
        inputInicio.value = '';
        inputFin.value = '';
    }
}

function descargarInformePDFMayorista(autoPdf = true) {
    const desde = document.getElementById('exportMayFechaInicio')?.value || '';
    const hasta = document.getElementById('exportMayFechaFin')?.value || '';

    showToast('Generando informe profesional en PDF de Incanto Mayorista...', 'info');
    const url = `/reporte-mayorista?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&usuario=${encodeURIComponent(USUARIO_ACTUAL)}${autoPdf ? '&autoPdf=1' : ''}`;
    window.open(url, '_blank');
    cerrarModalReporteMayorista();
}

function abrirReporteMayoristaEnPantalla() {
    descargarInformePDFMayorista(false);
}