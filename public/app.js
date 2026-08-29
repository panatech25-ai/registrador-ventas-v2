let carrito = [];
let params = new URLSearchParams(window.location.search);
let MARCA_ACTUAL = (params.get('marca') || 'panatech').toLowerCase();
let USUARIO_ACTUAL = params.get('usuario') || 'vendedor';
let ultimasOrdenesMemoria = [];
let html5QrCodeScanner = null;
let ultimaOrdenGuardada = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
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
// CONFIGURACIÓN DE MARCA UI
// ==========================================
function configurarMarcaUI() {
    const esIncanto = MARCA_ACTUAL === 'incanto';
    const logoImg = document.getElementById('brandLogo');
    const title = document.getElementById('brandTitle');
    const submitBtn = document.getElementById('submitBtn');
    const buscarBtn = document.getElementById('buscarBtn');
    const panelTitle = document.getElementById('panelUltimosTitle');
    const agregarLabel = document.getElementById('agregarProdLabel');

    if (esIncanto) {
        if (logoImg) logoImg.src = '/logos/incanto.png';
        if (title) {
            title.textContent = 'INCANTO';
            title.className = 'text-base sm:text-2xl font-black tracking-wider text-rose-500 leading-none';
        }
        if (submitBtn) submitBtn.className = 'flex-1 sm:flex-none bg-rose-600 hover:bg-rose-500 font-bold py-2.5 px-6 rounded-lg text-white shadow-lg transition text-center text-xs';
        if (buscarBtn) buscarBtn.className = 'bg-rose-600 hover:bg-rose-500 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition shadow';
        if (panelTitle) panelTitle.className = 'text-xs font-bold tracking-wider text-rose-400 uppercase';
        if (agregarLabel) agregarLabel.className = 'block text-xs font-semibold text-rose-400 uppercase tracking-wider';
    } else {
        if (logoImg) logoImg.src = '/logos/panatech.png';
        if (title) {
            title.textContent = 'PANATECH';
            title.className = 'text-base sm:text-2xl font-black tracking-wider text-sky-400 leading-none';
        }
    }
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

        if (!productos || productos.length === 0) {
            resDiv.innerHTML = '<div class="p-3 text-xs text-slate-400 italic text-center">No se encontraron productos</div>';
        } else {
            resDiv.innerHTML = productos.map(p => {
                const stockNum = parseInt(p.stock) || 0;
                let stockBadge = `<span class="text-[10px] text-slate-400">Stock: ${stockNum}</span>`;
                if (stockNum <= 0) {
                    stockBadge = `<span class="text-[9px] bg-rose-950/80 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded font-bold">❌ Sin stock</span>`;
                } else if (stockNum <= 2) {
                    stockBadge = `<span class="text-[9px] bg-amber-950/80 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-bold">⚠️ Poco stock: ${stockNum}</span>`;
                }

                return `
                <div onclick="seleccionarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="p-2.5 hover:bg-slate-700/80 cursor-pointer border-b border-slate-700/50 flex justify-between items-center transition">
                    <div>
                        <div class="text-xs font-bold text-white">${p.nombre}</div>
                        <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Var: ${p.variante || 'N/A'}</span>
                            <span>•</span>
                            ${stockBadge}
                        </div>
                    </div>
                    <div class="text-xs font-bold text-emerald-400">$${parseFloat(p.precio).toFixed(2)}</div>
                </div>
            `;
            }).join('');
        }
        resDiv.classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
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
            precio: parseFloat(p.precio),
            cantidad: 1
        });
        showToast(`Agregado: ${p.nombre}`, 'success');
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

    container.innerHTML = carrito.map((item, index) => `
        <div class="flex items-center justify-between bg-slate-900/90 p-2.5 rounded-xl border border-slate-700/80 text-xs">
            <div class="flex-1 pr-2">
                <div class="font-bold text-white">${item.nombre}</div>
                <div class="text-[10px] text-slate-400">${item.variante || ''}</div>
            </div>
            <div class="flex items-center gap-2">
                <input type="number" min="1" value="${item.cantidad}" onchange="cambiarCantidad(${index}, this.value)" class="w-12 bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-center font-bold text-white">
                <div class="font-bold text-emerald-400 w-16 text-right">$${(item.precio * item.cantidad).toFixed(2)}</div>
                <button type="button" onclick="eliminarDelCarrito(${index})" class="text-rose-400 hover:text-rose-300 font-bold px-1.5" title="Quitar">✕</button>
            </div>
        </div>
    `).join('');

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
        marca: MARCA_ACTUAL
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

        carrito = (data.orden_detalles || []).map(d => ({
            id: d.producto_id,
            nombre: (d.productos && d.productos.nombre) ? d.productos.nombre : 'Producto',
            variante: d.productos ? d.productos.variante : '',
            precio: parseFloat(d.precio_unitario),
            cantidad: d.cantidad
        }));

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

async function cargarUltimasOrdenes() {
    const list = document.getElementById('listaUltimasOrdenes');
    const filtroSelectDesk = document.getElementById('filtroEstadoLista');
    const filtroSelectMovil = document.getElementById('filtroEstadoListaMovil');
    const contador = document.getElementById('contadorOrdenes');
    
    let estadoFiltro = 'TODOS';
    if (filtroSelectDesk) {
        estadoFiltro = filtroSelectDesk.value;
        if (filtroSelectMovil && filtroSelectMovil.value !== estadoFiltro) {
            filtroSelectMovil.value = estadoFiltro;
        }
    } else if (filtroSelectMovil) {
        estadoFiltro = filtroSelectMovil.value;
    }

    try {
        const res = await fetch(`/api/ordenes/ultimas?marca=${MARCA_ACTUAL}&limite=30`);
        const ordenes = await res.json();
        ultimasOrdenesMemoria = ordenes || [];

        let ordenesFiltradas = ultimasOrdenesMemoria;
        if (estadoFiltro === 'ENVIOS_PENDIENTES') {
            ordenesFiltradas = ultimasOrdenesMemoria.filter(o => 
                o.modo_entrega === 'Envio' && o.estado !== 'Finalizado' && o.estado !== 'Cancelado'
            );
        } else if (estadoFiltro !== 'TODOS') {
            ordenesFiltradas = ultimasOrdenesMemoria.filter(o => o.estado === estadoFiltro);
        }

        if (contador) contador.textContent = ordenesFiltradas.length;

        if (ordenesFiltradas.length === 0) {
            const labelVacio = estadoFiltro === 'ENVIOS_PENDIENTES' 
                ? 'de envíos pendientes de entrega' 
                : (estadoFiltro !== 'TODOS' ? `en estado '${estadoFiltro}'` : '');
            list.innerHTML = `<p class="text-xs text-slate-500 italic p-3 text-center">Sin pedidos ${labelVacio}.</p>`;
            return;
        }

        list.innerHTML = ordenesFiltradas.map(o => {
            let colorBorder = 'border-amber-700/60 bg-amber-950/30';
            let colorTexto = 'text-amber-400';
            if (o.estado === 'Abonado') { colorBorder = 'border-blue-700/60 bg-blue-950/30'; colorTexto = 'text-blue-400'; }
            if (o.estado === 'Preparado') { colorBorder = 'border-purple-700/60 bg-purple-950/30'; colorTexto = 'text-purple-400'; }
            if (o.estado === 'Finalizado') { colorBorder = 'border-emerald-700/60 bg-emerald-950/30'; colorTexto = 'text-emerald-400'; }
            if (o.estado === 'Cancelado') { colorBorder = 'border-rose-700/60 bg-rose-950/30'; colorTexto = 'text-rose-400'; }

            return `
                <div class="p-3 bg-slate-900/90 hover:bg-slate-900 rounded-xl border ${colorBorder} transition flex flex-col gap-2 text-xs group shadow-sm">
                    <div class="flex justify-between items-start cursor-pointer" onclick="cargarOrdenEnFormulario('${o.numero_orden}')">
                        <div>
                            <div class="font-black text-white flex items-center gap-1.5">
                                <span>${o.numero_orden}</span>
                                <span class="font-normal text-slate-400 text-[11px] truncate max-w-[130px]">- ${o.cliente_nombre || 'S/D'}</span>
                            </div>
                            <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>📅 ${formatearFechaVista(o.fecha)}</span>
                                <span>${o.modo_entrega === 'Envio' ? '🛵 Envío' : '🛍️ Retiro'}</span>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="font-extrabold text-emerald-400 text-sm">$${parseFloat(o.total).toFixed(2)}</div>
                        </div>
                    </div>

                    <!-- Fila de Acciones Rápidas: Selector de Estado e Impresión Directa -->
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800">
                        <select onchange="cambiarEstadoRapido(${o.id}, this.value)" class="bg-slate-800 border border-slate-700 text-[10px] font-bold ${colorTexto} rounded-md px-2 py-1 focus:outline-none">
                            <option value="Iniciado" ${o.estado === 'Iniciado' ? 'selected' : ''}>🟡 Iniciado</option>
                            <option value="Abonado" ${o.estado === 'Abonado' ? 'selected' : ''}>🔵 Abonado</option>
                            <option value="Preparado" ${o.estado === 'Preparado' ? 'selected' : ''}>🟣 Preparado</option>
                            <option value="Finalizado" ${o.estado === 'Finalizado' ? 'selected' : ''}>🟢 Finalizado</option>
                            <option value="Cancelado" ${o.estado === 'Cancelado' ? 'selected' : ''}>🔴 Cancelado</option>
                        </select>

                        <div class="flex items-center gap-1">
                            <button type="button" onclick="imprimirEtiquetaDirecta(${JSON.stringify(o).replace(/"/g, '&quot;')})" title="Imprimir Etiqueta" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-1 rounded-md text-[11px] border border-slate-700 transition">
                                🖨️
                            </button>
                            <button type="button" onclick="cargarOrdenEnFormulario('${o.numero_orden}')" title="Editar Pedido" class="bg-slate-800 hover:bg-slate-700 text-sky-400 p-1 rounded-md text-[11px] border border-slate-700 transition">
                                ✏️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-xs text-rose-400 p-2">Error al cargar listado de pedidos.</p>';
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
            cargarUltimasOrdenes();
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
    const buscarInput = document.getElementById('buscarOrdenInput');
    if (buscarInput) buscarInput.value = '';
    
    // Scroll hacia el formulario
    const formElement = document.getElementById('ordenForm');
    if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    showToast('Nuevo pedido listo para registrar.', 'info');
}

function cargarOrdenEnFormulario(num) {
    document.getElementById('buscarOrdenInput').value = num;
    buscarOrden();

    // En versión celular (menor a 1024px), ocultar la lista de pedidos recientes
    if (window.innerWidth < 1024) {
        const container = document.getElementById('contenedorListaPedidosMovil');
        const icono = document.getElementById('iconoDesplegableMovil');
        if (container && !container.classList.contains('hidden')) {
            container.classList.add('hidden');
            if (icono) icono.innerHTML = '📋 Ver Pedidos ▼';
        }
        // Scroll suave al formulario para ver el pedido cargado
        const formContainer = document.getElementById('ordenForm');
        if (formContainer) {
            formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
function abrirModalExportar() { document.getElementById('modalExportar').classList.remove('hidden'); }
function cerrarModalExportar() { document.getElementById('modalExportar').classList.add('hidden'); }

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
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;
    
    showToast('Generando informe completo en Excel...', 'info');
    window.location.href = `/api/ordenes/exportar?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${MARCA_ACTUAL}`;
    cerrarModalExportar();
}

// ==========================================
// MODAL STOCK Y PRECIOS
// ==========================================
function abrirModalStock() { document.getElementById('modalStock').classList.remove('hidden'); }
function cerrarModalStock() { document.getElementById('modalStock').classList.add('hidden'); }

const onBuscarStockInput = debounce((val) => buscarParaCambiarStock(val), 250);

async function buscarParaCambiarStock(q) {
    const container = document.getElementById('resultadosCambioStock');
    if (!q || q.trim().length === 0) {
        container.classList.add('hidden');
        return;
    }

    const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(q)}&marca=${MARCA_ACTUAL}`);
    const productos = await res.json();

    if (!productos || productos.length === 0) {
        container.innerHTML = '<div class="p-2 text-xs text-slate-400 text-center">Sin resultados</div>';
    } else {
        container.innerHTML = productos.map(p => `
            <div onclick="seleccionarProdParaStock(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="p-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800 text-xs text-white flex justify-between items-center">
                <div>
                    <b>${p.nombre}</b> - ${p.variante || 'N/A'}
                </div>
                <div class="text-right">
                    <span class="text-emerald-400 font-bold">$${p.precio}</span>
                    <span class="text-slate-400 text-[10px] block">Stock: ${p.stock}</span>
                </div>
            </div>
        `).join('');
    }
    container.classList.remove('hidden');
}

function seleccionarProdParaStock(p) {
    document.getElementById('editStockProdId').value = p.id;
    document.getElementById('editProdNombre').value = p.nombre || '';
    document.getElementById('editStockProdVariante').textContent = `Variante: ${p.variante || 'N/A'}`;
    document.getElementById('editProdPrecio').value = p.precio;
    document.getElementById('editProdStock').value = p.stock;

    document.getElementById('resultadosCambioStock').classList.add('hidden');
    document.getElementById('detalleProdEditarStock').classList.remove('hidden');

    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');

    const btnEliminar = document.getElementById('btnEliminarProdStock');
    if (btnEliminar) btnEliminar.classList.remove('hidden');
}

function volverAtrasStock() {
    document.getElementById('detalleProdEditarStock').classList.add('hidden');
    document.getElementById('buscarStockInput').value = '';
    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');

    const btnEliminar = document.getElementById('btnEliminarProdStock');
    if (btnEliminar) btnEliminar.classList.add('hidden');
}

async function guardarNuevoStockCat() {
    const id = document.getElementById('editStockProdId').value;
    const nombre = document.getElementById('editProdNombre').value;
    const precio = document.getElementById('editProdPrecio').value;
    const stock = document.getElementById('editProdStock').value;

    if (!nombre || nombre.trim() === '') {
        showToast('El nombre del producto no puede estar vacío.', 'warning');
        return;
    }

    const res = await fetch(`/api/productos/${id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, precio, stock })
    });

    const data = await res.json();
    if (data.success) {
        showToast('Producto y stock actualizados correctamente.', 'success');
        volverAtrasStock();
        cerrarModalStock();
    } else {
        showToast('Error al actualizar el producto.', 'error');
    }
}

async function eliminarProductoStock() {
    const id = document.getElementById('editStockProdId').value;
    const nombre = document.getElementById('editProdNombre').value;

    if (!id) return;

    if (!confirm(`¿Estás seguro de que deseas eliminar el producto "${nombre}" del catálogo?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/productos/${id}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.mensaje || 'Producto eliminado.', data.esReferenciado ? 'warning' : 'success');
            volverAtrasStock();
            cerrarModalStock();
        } else {
            showToast('Error al eliminar: ' + (data.error || ''), 'error');
        }
    } catch (err) {
        showToast('Error de conexión al eliminar producto.', 'error');
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
    const chkProd = false;
    const chkTotal = orden.estado === 'Abonado' || orden.estado === 'Finalizado';

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