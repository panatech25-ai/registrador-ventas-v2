let carrito = [];

const urlParams = new URLSearchParams(window.location.search);
const marcaActual = (urlParams.get('marca') || 'panatech').toLowerCase();
const usuarioLogueado = urlParams.get('usuario') || 'Vendedor';

document.addEventListener('DOMContentLoaded', () => {
    aplicarEstilosMarca();
    establecerFechaActual();
    cargarUltimasOrdenes();
    renderCarrito();
    actualizarColorEstado(document.getElementById('estado_pedido').value);
});

function establecerFechaActual() {
    const hoy = new Date();
    const offset = hoy.getTimezoneOffset();
    const fechaLocal = new Date(hoy.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.value = fechaLocal;
}

function actualizarColorEstado(valor) {
    const select = document.getElementById('estado_pedido');
    if (!select) return;

    select.className = "w-full rounded-lg p-2 text-xs font-bold focus:outline-none transition-colors border ";
    
    if (valor === 'Iniciado') {
        select.className += "bg-amber-950/80 border-amber-700 text-amber-300";
    } else if (valor === 'Abonado') {
        select.className += "bg-blue-950/80 border-blue-700 text-blue-300";
    } else if (valor === 'Finalizado') {
        select.className += "bg-emerald-950/80 border-emerald-700 text-emerald-300";
    } else if (valor === 'Cancelado') {
        select.className += "bg-rose-950/80 border-rose-700 text-rose-300";
    }
}

function aplicarEstilosMarca() {
    const inputVendedor = document.getElementById('vendedor');
    if (inputVendedor) inputVendedor.value = usuarioLogueado;

    const brandLogo = document.getElementById('brandLogo');
    const brandTitle = document.getElementById('brandTitle');
    const submitBtn = document.getElementById('submitBtn');
    const buscarBtn = document.getElementById('buscarBtn');
    const panelUltimosTitle = document.getElementById('panelUltimosTitle');
    const agregarProdLabel = document.getElementById('agregarProdLabel');
    const buscarOrdenInput = document.getElementById('buscarOrdenInput');

    if (marcaActual === 'incanto') {
        if (brandTitle) {
            brandTitle.innerText = 'INCANTO';
            brandTitle.className = 'text-lg sm:text-2xl font-black tracking-wider text-rose-400';
        }
        if (brandLogo) {
            brandLogo.src = '/logos/incanto.png';
            brandLogo.onerror = function() { this.src = 'https://cdn-icons-png.flaticon.com/512/891/891462.png'; };
        }
        if (submitBtn) submitBtn.className = 'flex-1 sm:flex-none bg-rose-600 hover:bg-rose-500 font-bold py-2.5 px-6 rounded-lg text-white shadow-lg transition text-center';
        if (buscarBtn) buscarBtn.className = 'bg-rose-600 hover:bg-rose-500 px-4 py-2 rounded text-sm font-bold text-white transition';
        if (panelUltimosTitle) panelUltimosTitle.className = 'text-xs font-bold tracking-wider text-rose-400 uppercase';
        if (agregarProdLabel) agregarProdLabel.className = 'block text-xs font-semibold text-rose-400';
        if (inputVendedor) inputVendedor.className = 'w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-rose-300 font-semibold cursor-not-allowed';
        if (buscarOrdenInput) buscarOrdenInput.placeholder = 'Ej: #INC-1001';
    } else {
        if (brandTitle) {
            brandTitle.innerText = 'PANATECH';
            brandTitle.className = 'text-lg sm:text-2xl font-black tracking-wider text-sky-400';
        }
        if (brandLogo) {
            brandLogo.src = '/logos/panatech.png';
            brandLogo.onerror = function() { this.src = 'https://cdn-icons-png.flaticon.com/512/891/891462.png'; };
        }
        if (buscarOrdenInput) buscarOrdenInput.placeholder = 'Ej: #PAN-1001';
    }
}

function mostrarNotificacion(mensaje, tipo = 'exito') {
    let toast = document.getElementById('toastNotificacion');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotificacion';
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl font-bold text-xs shadow-2xl transition transform translate-y-10 opacity-0 border';
        document.body.appendChild(toast);
    }

    if (tipo === 'exito') {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl font-bold text-xs shadow-2xl transition transform translate-y-0 opacity-100 bg-emerald-900 border-emerald-500 text-emerald-200';
    } else {
        toast.className = 'fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl font-bold text-xs shadow-2xl transition transform translate-y-0 opacity-100 bg-rose-900 border-rose-500 text-rose-200';
    }

    toast.innerText = mensaje;

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
    }, 3000);
}

// Cargar Órdenes
async function cargarUltimasOrdenes() {
    const container = document.getElementById('listaUltimasOrdenes');
    try {
        const res = await fetch(`/api/ordenes/ultimas?marca=${marcaActual}`);
        const ordenes = await res.json();

        if (!ordenes || !Array.isArray(ordenes) || ordenes.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 italic">No hay pedidos registrados aún.</p>`;
            return;
        }

        container.innerHTML = ordenes.map(o => {
            let colorEstado = 'bg-amber-950 text-amber-400 border-amber-700';
            if (o.estado === 'Abonado') colorEstado = 'bg-blue-950 text-blue-400 border-blue-700';
            if (o.estado === 'Finalizado') colorEstado = 'bg-emerald-950 text-emerald-400 border-emerald-700';
            if (o.estado === 'Cancelado') colorEstado = 'bg-rose-950 text-rose-400 border-rose-700';

            return `
            <div onclick="buscarOrdenDirecta('${o.numero_orden}')" 
                 class="p-2.5 bg-slate-900/80 hover:bg-slate-700/80 rounded-lg border border-slate-700/50 cursor-pointer transition flex justify-between items-center">
                <div>
                    <div class="font-bold text-xs ${o.numero_orden.startsWith('#INC') ? 'text-rose-400' : 'text-sky-400'}">${o.numero_orden} <span class="text-[10px] text-slate-400 font-normal">(${o.cliente_nombre || 'S/N'})</span></div>
                    <div class="text-[10px] text-slate-400">${new Date(o.fecha).toLocaleDateString('es-AR')} | $${o.total}</div>
                </div>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorEstado}">
                    ${o.estado || 'Iniciado'}
                </span>
            </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic">No hay pedidos registrados aún.</p>`;
    }
}

// Buscar Productos
async function buscarProductos(query) {
    const resContainer = document.getElementById('prodResults');

    try {
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(query ? query.trim() : '')}&marca=${marcaActual}`);
        const productos = await res.json();

        if (!productos || productos.length === 0) {
            resContainer.innerHTML = `<div class="p-3 text-xs text-slate-400 italic">No se encontraron productos.</div>`;
        } else {
            resContainer.innerHTML = productos.map(p => `
                <div onclick="agregarAlCarrito(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', '${p.variante || ''}', ${p.precio}, ${p.stock})" 
                     class="p-2.5 hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-700/50 flex justify-between items-center transition">
                    <div>
                        <div class="font-bold text-white">${p.nombre}</div> 
                        <div class="${marcaActual === 'incanto' ? 'text-rose-300' : 'text-sky-300'} text-[11px]">${p.variante || 'Variante Única'}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-emerald-400 font-bold">$${p.precio}</div> 
                        <div class="${p.stock > 0 ? 'text-slate-400' : 'text-red-400 font-semibold'} text-[10px]">Stock: ${p.stock}</div>
                    </div>
                </div>
            `).join('');
        }
        resContainer.classList.remove('hidden');
    } catch (err) {
        console.error('Error al buscar productos:', err);
    }
}

document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('prodSearch');
    const searchResults = document.getElementById('prodResults');
    if (searchInput && searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.classList.add('hidden');
    }
});

// Carrito
function agregarAlCarrito(id, nombre, variante, precio, stock) {
    const index = carrito.findIndex(item => item.id === id);
    if (index > -1) {
        carrito[index].cantidad += 1;
    } else {
        carrito.push({ id, nombre, variante, precio, stock, cantidad: 1 });
    }
    
    document.getElementById('prodSearch').value = '';
    document.getElementById('prodResults').classList.add('hidden');
    renderCarrito();
}

function removerDelCarrito(index) {
    carrito.splice(index, 1);
    renderCarrito();
}

function actualizarCantidad(index, cant) {
    const cantidadParseada = parseInt(cant) || 1;
    carrito[index].cantidad = cantidadParseada < 1 ? 1 : cantidadParseada;
    renderCarrito();
}

function renderCarrito() {
    const container = document.getElementById('carritoContainer');
    if (carrito.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 italic py-1">No hay productos seleccionados.</p>`;
    } else {
        container.innerHTML = carrito.map((item, index) => `
            <div class="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-700">
                <div class="pr-2">
                    <div class="font-bold text-white text-xs">${item.nombre} <span class="${marcaActual === 'incanto' ? 'text-rose-300' : 'text-sky-300'} font-normal">(${item.variante || 'Normal'})</span></div>
                    <div class="text-[11px] text-slate-400">$${item.precio} c/u | <span class="text-amber-400">Stock: ${item.stock}</span></div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-emerald-400 font-bold text-xs bg-slate-800 border border-slate-700 px-2.5 py-1 rounded">$${item.precio * item.cantidad}</span>
                    <input type="number" min="1" value="${item.cantidad}" onchange="actualizarCantidad(${index}, this.value)" class="w-12 bg-slate-800 border border-slate-600 rounded p-1 text-center text-xs text-white focus:outline-none">
                    <button type="button" onclick="removerDelCarrito(${index})" class="text-red-400 font-bold hover:text-red-300 px-1 text-sm">✕</button>
                </div>
            </div>
        `).join('');
    }
    calcularTotal();
}

function toggleEnvioFields() {
    const modo = document.getElementById('modo_entrega').value;
    const envioFields = document.getElementById('envioFields');
    if (modo === 'Envio') {
        envioFields.classList.remove('hidden');
    } else {
        envioFields.classList.add('hidden');
    }
    calcularTotal();
}

function calcularTotal() {
    let subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
    const modo = document.getElementById('modo_entrega').value;
    const costoEnvio = modo === 'Envio' ? parseFloat(document.getElementById('costo_envio').value) || 0 : 0;
    
    const total = subtotal + costoEnvio;
    document.getElementById('totalLabel').innerText = `$${total.toFixed(2)}`;
}

// Modal Producto Manual
function abrirModalManual() {
    document.getElementById('modalManual').classList.remove('hidden');
}

function cerrarModalManual() {
    document.getElementById('modalManual').classList.add('hidden');
    document.getElementById('manualNombre').value = '';
    document.getElementById('manualVariante').value = '';
    document.getElementById('manualPrecio').value = '';
}

async function guardarProductoManual() {
    const nombre = document.getElementById('manualNombre').value.trim();
    const variante = document.getElementById('manualVariante').value.trim();
    const precio = parseFloat(document.getElementById('manualPrecio').value);
    const stock = 10;

    if (!nombre || isNaN(precio)) {
        alert("Completá el nombre y el precio del producto.");
        return;
    }

    try {
        const res = await fetch('/api/productos/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, variante, precio, stock, marca: marcaActual })
        });
        const data = await res.json();

        if (data.success && data.producto) {
            agregarAlCarrito(data.producto.id, data.producto.nombre, data.producto.variante, data.producto.precio, data.producto.stock);
            cerrarModalManual();
        } else {
            alert('Error al guardar el producto manual.');
        }
    } catch (err) {
        alert('Error de red al conectar con el servidor.');
    }
}

// Modal Stock y Precios
function abrirModalStock() {
    document.getElementById('modalStock').classList.remove('hidden');
    volverAtrasStock();
}

function cerrarModalStock() {
    document.getElementById('modalStock').classList.add('hidden');
}

function volverAtrasStock() {
    document.getElementById('buscarStockInput').value = '';
    document.getElementById('resultadosCambioStock').classList.add('hidden');
    document.getElementById('detalleProdEditarStock').classList.add('hidden');

    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
    btn.classList.remove('hover:bg-amber-500');
}

async function buscarParaCambiarStock(query) {
    const resContainer = document.getElementById('resultadosCambioStock');

    if (!query || query.trim().length === 0) {
        resContainer.innerHTML = '';
        resContainer.classList.add('hidden');
        return;
    }

    try {
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(query.trim())}&marca=${marcaActual}`);
        const productos = await res.json();

        if (!productos || productos.length === 0) {
            resContainer.innerHTML = `<div class="p-3 text-xs text-slate-400 italic">No se encontraron productos.</div>`;
        } else {
            resContainer.innerHTML = productos.map(p => `
                <div onclick="seleccionarProdParaStock(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', '${p.variante || ''}', ${p.precio}, ${p.stock})" 
                     class="p-2.5 hover:bg-slate-800 cursor-pointer text-xs border-b border-slate-700 flex justify-between items-center transition">
                    <div>
                        <div class="font-bold text-white">${p.nombre}</div> 
                        <div class="text-slate-400 text-[10px]">${p.variante || 'Única'}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-emerald-400 font-bold">$${p.precio}</div>
                        <div class="text-amber-400 text-[10px]">Stock: ${p.stock}</div>
                    </div>
                </div>
            `).join('');
        }
        resContainer.classList.remove('hidden');
    } catch (err) {
        console.error('Error al buscar producto:', err);
    }
}

function seleccionarProdParaStock(id, nombre, variante, precioActual, stockActual) {
    document.getElementById('editStockProdId').value = id;
    document.getElementById('editStockProdNombre').innerText = nombre;
    document.getElementById('editStockProdVariante').innerText = `Variante: ${variante || 'Única'}`;
    document.getElementById('editProdPrecio').value = precioActual;
    document.getElementById('editProdStock').value = stockActual;

    document.getElementById('resultadosCambioStock').classList.add('hidden');
    document.getElementById('buscarStockInput').value = nombre;
    document.getElementById('detalleProdEditarStock').classList.remove('hidden');

    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
    btn.classList.add('hover:bg-amber-500');
}

async function guardarNuevoStockCat() {
    const id = document.getElementById('editStockProdId').value;
    const nuevoPrecio = parseFloat(document.getElementById('editProdPrecio').value);
    const nuevoStock = parseInt(document.getElementById('editProdStock').value);

    if (!id || isNaN(nuevoPrecio) || nuevoPrecio < 0 || isNaN(nuevoStock) || nuevoStock < 0) {
        mostrarNotificacion('Ingresá valores válidos', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/productos/${id}/stock`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ precio: nuevoPrecio, stock: nuevoStock })
        });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion('✅ ¡Producto actualizado con éxito!', 'exito');
            
            const index = carrito.findIndex(item => item.id == id);
            if (index > -1) {
                carrito[index].precio = nuevoPrecio;
                carrito[index].stock = nuevoStock;
                renderCarrito();
            }

            setTimeout(() => { cerrarModalStock(); }, 1200);
        } else {
            mostrarNotificacion('❌ Error al actualizar', 'error');
        }
    } catch (err) {
        mostrarNotificacion('❌ Error de conexión', 'error');
    }
}

// Modal Exportar Excel
function abrirModalExportar() {
    const hoy = new Date().toISOString().split('T')[0];
    const primerDiaMes = new Date();
    primerDiaMes.setDate(1);
    const inicioMes = primerDiaMes.toISOString().split('T')[0];

    document.getElementById('exportFechaInicio').value = inicioMes;
    document.getElementById('exportFechaFin').value = hoy;
    document.getElementById('modalExportar').classList.remove('hidden');
}

function cerrarModalExportar() {
    document.getElementById('modalExportar').classList.add('hidden');
}

function descargarCSVFiltrado() {
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;

    if (!desde || !hasta) {
        alert('Por favor seleccioná ambas fechas.');
        return;
    }

    window.location.href = `/api/ordenes/exportar?desde=${desde}&hasta=${hasta}&marca=${marcaActual}`;
    cerrarModalExportar();
}

// Guardar / Actualizar Orden
async function guardarOrden(e) {
    e.preventDefault();
    if (carrito.length === 0) {
        alert("Por favor agregá al menos un producto.");
        return;
    }

    const ordenId = document.getElementById('ordenId').value;
    const modo = document.getElementById('modo_entrega').value;
    const costoEnvio = modo === 'Envio' ? parseFloat(document.getElementById('costo_envio').value) || 0 : 0;
    const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

    const payload = {
        fecha: document.getElementById('fecha').value,
        vendedor: document.getElementById('vendedor').value,
        cliente_nombre: document.getElementById('cliente_nombre').value,
        cliente_telefono: document.getElementById('cliente_telefono').value,
        modo_entrega: modo,
        cadete: modo === 'Envio' ? document.getElementById('cadete').value : '',
        direccion_envio: modo === 'Envio' ? document.getElementById('direccion_envio').value : '',
        costo_envio: costoEnvio,
        horario_envio: modo === 'Envio' ? document.getElementById('horario_envio').value : '',
        estado: document.getElementById('estado_pedido').value,
        metodo_pago: document.getElementById('metodo_pago').value,
        marca: marcaActual,
        productos: carrito,
        total: subtotal + costoEnvio
    };

    const url = ordenId ? `/api/ordenes/${ordenId}` : '/api/ordenes';
    const method = ordenId ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
            if (!ordenId) {
                document.getElementById('modalNumOrden').innerText = data.numero_orden;
                document.getElementById('modalExito').classList.remove('hidden');
            } else {
                mostrarNotificacion('✅ ¡Orden actualizada correctamente!', 'exito');
            }
            limpiarFormulario();
            cargarUltimasOrdenes();
        } else {
            mostrarNotificacion('❌ Error al guardar la orden', 'error');
        }
    } catch (err) {
        mostrarNotificacion('❌ Error de red al conectar con el servidor', 'error');
    }
}

// Buscar Orden
function buscarOrdenDirecta(numeroOrden) {
    document.getElementById('buscarOrdenInput').value = numeroOrden;
    buscarOrden();
}

async function buscarOrden() {
    const numInput = document.getElementById('buscarOrdenInput').value.trim();
    if (!numInput) return;

    try {
        const res = await fetch(`/api/ordenes/buscar/${encodeURIComponent(numInput)}?marca=${marcaActual}`);
        const data = await res.json();

        if (!res.ok || data.error) {
            alert(data.error || 'No se encontró ninguna orden.');
            return;
        }

        const orden = data;
        
        document.getElementById('ordenId').value = orden.id;
        if (orden.fecha) {
            document.getElementById('fecha').value = new Date(orden.fecha).toISOString().split('T')[0];
        }
        document.getElementById('vendedor').value = orden.vendedor || '';
        document.getElementById('cliente_nombre').value = orden.cliente_nombre || '';
        document.getElementById('cliente_telefono').value = orden.cliente_telefono || '';
        document.getElementById('modo_entrega').value = orden.modo_entrega;
        document.getElementById('estado_pedido').value = orden.estado || 'Iniciado';
        actualizarColorEstado(orden.estado || 'Iniciado');
        
        document.getElementById('metodo_pago').value = orden.metodo_pago || 'Sin especificar';
        
        toggleEnvioFields();
        if (orden.modo_entrega === 'Envio') {
            document.getElementById('cadete').value = orden.cadete || '';
            document.getElementById('costo_envio').value = orden.costo_envio || 0;
            document.getElementById('direccion_envio').value = orden.direccion_envio || '';
            document.getElementById('horario_envio').value = orden.horario_envio || '';
        }

        carrito = orden.orden_detalles.map(d => ({
            id: d.producto_id,
            nombre: d.productos ? d.productos.nombre : 'Producto registrado',
            variante: d.productos ? d.productos.variante : '',
            precio: d.precio_unitario,
            stock: d.productos ? d.productos.stock : 0,
            cantidad: d.cantidad
        }));

        renderCarrito();
        document.getElementById('submitBtn').innerText = 'Actualizar Orden';
    } catch (err) {
        alert('Error al buscar la orden.');
    }
}

function limpiarFormulario() {
    document.getElementById('ordenForm').reset();
    document.getElementById('ordenId').value = '';
    establecerFechaActual();
    document.getElementById('buscarOrdenInput').value = '';
    
    document.getElementById('vendedor').value = usuarioLogueado;
    document.getElementById('estado_pedido').value = 'Iniciado';
    actualizarColorEstado('Iniciado');
    
    document.getElementById('metodo_pago').value = 'Sin especificar';

    carrito = [];
    renderCarrito();
    toggleEnvioFields();
    document.getElementById('submitBtn').innerText = 'Confirmar Orden';
}

function cerrarModal() {
    document.getElementById('modalExito').classList.add('hidden');
}

// Imprimir Etiqueta con Teléfono Incluido
function imprimirEtiqueta() {
    const clienteNombre = document.getElementById('cliente_nombre').value.trim();
    const clienteTelefono = document.getElementById('cliente_telefono').value.trim();
    const modoEntrega = document.getElementById('modo_entrega').value;
    const metodoPago = document.getElementById('metodo_pago').value;
    const direccion = document.getElementById('direccion_envio').value.trim();
    const horario = document.getElementById('horario_envio').value.trim();
    const totalTexto = document.getElementById('totalLabel').innerText;

    if (!clienteNombre) {
        alert("Por favor ingresá el nombre del cliente antes de imprimir.");
        return;
    }

    const esIncanto = marcaActual === 'incanto';
    
    const logoImg = esIncanto ? '/logos/incanto.png' : '/logos/panatech.png';
    const colorFranja = esIncanto ? '#e8d5e0' : '#dbeafe'; 
    const colorTextoFooter = esIncanto ? '#4a154b' : '#0369a1';
    const telefonoLocal = esIncanto ? '341 696-4783' : '341 300-1081';
    const instagram = esIncanto ? '@incanto.rosario' : '@panatech.rosario';

    const waIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="#25D366" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>`;
    const igIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="#E1306C" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;

    let camposEnvioDebajoNombre = '';
    if (modoEntrega === 'Envio') {
        camposEnvioDebajoNombre = `
            <div class="campo">
                <span class="label">Dirección:</span>
                <span class="valor">${direccion || 'S/D'}</span>
            </div>
            <div class="linea-punteada"></div>

            <div class="campo">
                <span class="label">Horario:</span>
                <span class="valor">${horario || 'S/H'}</span>
            </div>
            <div class="linea-punteada"></div>
        `;
    }

    const ticketHTML = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Etiqueta - ${clienteNombre}</title>
            <style>
                @page { size: 80mm auto; margin: 0; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; width: 76mm; margin: 0 auto; background: #fff; color: #1a1a1a; }
                .tarjeta-container { padding: 12px 12px 0 12px; position: relative; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
                .titulo-container { display: flex; align-items: center; gap: 4px; }
                .titulo { font-family: 'Georgia', serif; font-size: 16px; font-weight: bold; letter-spacing: -0.3px; }
                .sparkles { font-size: 12px; }
                .logo { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
                .cuerpo { margin-bottom: 20px; }
                .campo { display: flex; align-items: baseline; gap: 6px; font-size: 13px; margin-top: 8px; }
                .label { font-family: 'Georgia', serif; font-weight: bold; font-size: 13px; min-width: 65px; }
                .valor { font-size: 13px; font-weight: 600; }
                .linea-punteada { border-bottom: 1.5px dotted #666; margin-top: 2px; margin-bottom: 12px; width: 100%; }
                .footer-franja { background-color: ${colorFranja}; color: ${colorTextoFooter}; padding: 8px 10px; margin-top: 10px; font-size: 11px; font-weight: 500; }
                .footer-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
                .footer-bottom { text-align: center; margin-top: 2px; }
                .icon-text { display: inline-flex; align-items: center; gap: 4px; }
            </style>
        </head>
        <body>
            <div class="tarjeta-container">
                <div class="header">
                    <div class="titulo-container">
                        <h2 class="titulo">¡Gracias por tu compra!</h2>
                        <span class="sparkles">✨</span>
                    </div>
                    <img src="${logoImg}" alt="Logo" class="logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/891/891462.png'">
                </div>

                <div class="cuerpo">
                    <div class="campo">
                        <span class="label">Nombre:</span>
                        <span class="valor">${clienteNombre}</span>
                    </div>
                    <div class="linea-punteada"></div>

                    <div class="campo">
                        <span class="label">Teléfono:</span>
                        <span class="valor">${clienteTelefono || 'S/T'}</span>
                    </div>
                    <div class="linea-punteada"></div>

                    ${camposEnvioDebajoNombre}

                    <div class="campo">
                        <span class="label">Total:</span>
                        <span class="valor">${totalTexto} (${metodoPago})</span>
                    </div>
                    <div class="linea-punteada"></div>
                </div>
            </div>

            <div class="footer-franja">
                <div class="footer-top">
                    <span class="icon-text">📍 Callao 1255 11 E, Rosario</span>
                    <span class="icon-text">${waIconSvg} ${telefonoLocal}</span>
                </div>
                <div class="footer-bottom">
                    <span class="icon-text">${igIconSvg} ${instagram}</span>
                </div>
            </div>

            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                };
            </script>
        </body>
        </html>
    `;

    const ventanaImpresion = window.open('', '_blank', 'width=420,height=600');
    ventanaImpresion.document.write(ticketHTML);
    ventanaImpresion.document.close();
}