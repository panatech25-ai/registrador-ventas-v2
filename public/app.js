let carrito = [];
let params = new URLSearchParams(window.location.search);
let MARCA_ACTUAL = (params.get('marca') || 'panatech').toLowerCase();
let USUARIO_ACTUAL = params.get('usuario') || 'vendedor';

document.addEventListener('DOMContentLoaded', () => {
    configurarMarcaUI();
    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('vendedor').value = USUARIO_ACTUAL;
    cargarUltimasOrdenes();
    actualizarColorEstado('Iniciado');
});

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
            title.className = 'text-lg sm:text-2xl font-black tracking-wider text-rose-500';
        }
        if (submitBtn) submitBtn.className = 'flex-1 sm:flex-none bg-rose-600 hover:bg-rose-500 font-bold py-2.5 px-6 rounded-lg text-white shadow-lg transition text-center text-xs';
        if (buscarBtn) buscarBtn.className = 'bg-rose-600 hover:bg-rose-500 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition';
        if (panelTitle) panelTitle.className = 'text-xs font-bold tracking-wider text-rose-400 uppercase';
        if (agregarLabel) agregarLabel.className = 'block text-xs font-semibold text-rose-400 uppercase tracking-wider';
    } else {
        if (logoImg) logoImg.src = '/logos/panatech.png';
        if (title) {
            title.textContent = 'PANATECH';
            title.className = 'text-lg sm:text-2xl font-black tracking-wider text-sky-400';
        }
    }
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

// Asegurar que solo uno de los checkboxes de pago esté activo a la vez
function seleccionarPagoEnvio(idSeleccionado) {
    const chkProd = document.getElementById('chk_prod_abonado');
    const chkTotal = document.getElementById('chk_abonado_total');

    if (idSeleccionado === 'chk_prod_abonado' && chkProd.checked) {
        chkTotal.checked = false;
    } else if (idSeleccionado === 'chk_abonado_total' && chkTotal.checked) {
        chkProd.checked = false;
    }
}

// Formateador seguro de fechas para evitar desfase por Zona Horaria (UTC-3)
function formatearFechaVista(fechaRaw) {
    if (!fechaRaw) return 'S/D';
    const fechaLimpia = fechaRaw.split('T')[0];
    const partes = fechaLimpia.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaLimpia;
}

// Abrir chat directo de WhatsApp con el cliente
function abrirWhatsAppCliente() {
    const rawTel = document.getElementById('cliente_telefono').value;
    if (!rawTel || rawTel.trim() === '') {
        alert('Ingresá un número de teléfono primero.');
        return;
    }

    let numLimpio = rawTel.replace(/\D/g, '');
    if (!numLimpio.startsWith('54')) {
        numLimpio = '54' + numLimpio;
    }

    window.open(`https://wa.me/${numLimpio}`, '_blank');
}

// Enviar WhatsApp con datos del pedido al cadete/mensajería
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

async function buscarProductos(query) {
    const resDiv = document.getElementById('prodResults');
    if (!query || query.trim().length === 0) {
        resDiv.classList.add('hidden');
        return;
    }

    try {
        const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(query)}&marca=${MARCA_ACTUAL}`);
        const productos = await res.json();

        if (productos.length === 0) {
            resDiv.innerHTML = '<div class="p-3 text-xs text-slate-400 italic">No se encontraron productos</div>';
        } else {
            resDiv.innerHTML = productos.map(p => `
                <div onclick="seleccionarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="p-2.5 hover:bg-slate-700/80 cursor-pointer border-b border-slate-700/50 flex justify-between items-center transition">
                    <div>
                        <div class="text-xs font-bold text-white">${p.nombre}</div>
                        <div class="text-[10px] text-slate-400">Var: ${p.variante || 'N/A'} | Stock: ${p.stock}</div>
                    </div>
                    <div class="text-xs font-bold text-emerald-400">$${parseFloat(p.precio).toFixed(2)}</div>
                </div>
            `).join('');
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
    } else {
        carrito.push({
            id: p.id,
            nombre: p.nombre,
            variante: p.variante,
            precio: parseFloat(p.precio),
            cantidad: 1
        });
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
                <button type="button" onclick="eliminarDelCarrito(${index})" class="text-rose-400 hover:text-rose-300 font-bold px-1.5">✕</button>
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

async function guardarOrden(e) {
    e.preventDefault();

    if (carrito.length === 0) {
        alert('Debes agregar al menos un producto.');
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
                document.getElementById('modalExito').classList.remove('hidden');
            } else {
                alert('Orden actualizada correctamente.');
            }
            limpiarFormulario();
            cargarUltimasOrdenes();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Error al conectar con el servidor.');
    }
}

async function buscarOrden() {
    const input = document.getElementById('buscarOrdenInput').value;
    if (!input) return;

    try {
        const res = await fetch(`/api/ordenes/buscar/${encodeURIComponent(input)}?marca=${MARCA_ACTUAL}`);
        const data = await res.json();

        if (res.status === 403) {
            alert(data.error);
            return;
        }

        if (!res.ok || !data) {
            alert('Orden no encontrada.');
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
            nombre: d.productos ? d.productos.nombre : 'Producto',
            variante: d.productos ? d.productos.variante : '',
            precio: parseFloat(d.precio_unitario),
            cantidad: d.cantidad
        }));

        renderCarrito();
    } catch (err) {
        alert('Error al buscar la orden.');
    }
}

// Cargar pedidos con la fecha formateada correctamente
async function cargarUltimasOrdenes() {
    const list = document.getElementById('listaUltimasOrdenes');
    const filtroSelect = document.getElementById('filtroEstadoLista');
    const estadoFiltro = filtroSelect ? filtroSelect.value : 'TODOS';

    try {
        const res = await fetch(`/api/ordenes/ultimas?marca=${MARCA_ACTUAL}`);
        const ordenes = await res.json();

        const ordenesFiltradas = estadoFiltro === 'TODOS' 
            ? ordenes 
            : ordenes.filter(o => o.estado === estadoFiltro);

        if (ordenesFiltradas.length === 0) {
            list.innerHTML = `<p class="text-xs text-slate-500 italic p-2">Sin pedidos ${estadoFiltro !== 'TODOS' ? `en estado '${estadoFiltro}'` : ''}.</p>`;
            return;
        }

        list.innerHTML = ordenesFiltradas.map(o => {
            let colorEstado = 'bg-amber-950 text-amber-400 border-amber-700';
            if (o.estado === 'Abonado') colorEstado = 'bg-blue-950 text-blue-400 border-blue-700';
            if (o.estado === 'Preparado') colorEstado = 'bg-purple-950 text-purple-400 border-purple-700';
            if (o.estado === 'Finalizado') colorEstado = 'bg-emerald-950 text-emerald-400 border-emerald-700';
            if (o.estado === 'Cancelado') colorEstado = 'bg-rose-950 text-rose-400 border-rose-700';

            return `
                <div onclick="cargarOrdenEnFormulario('${o.numero_orden}')" class="p-2.5 bg-slate-900/80 hover:bg-slate-900 rounded-xl border border-slate-700/80 cursor-pointer transition flex justify-between items-center text-xs">
                    <div>
                        <div class="font-black text-white">${o.numero_orden} <span class="font-normal text-slate-400 text-[10px]">- ${o.cliente_nombre || 'S/D'}</span></div>
                        <div class="text-[10px] text-slate-400">${formatearFechaVista(o.fecha)}</div>
                    </div>
                    <div class="text-right">
                        <span class="text-[9px] px-2 py-0.5 rounded-full border ${colorEstado} font-bold">${o.estado}</span>
                        <div class="font-extrabold text-emerald-400 mt-0.5">$${parseFloat(o.total).toFixed(2)}</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-xs text-rose-400">Error al cargar listado.</p>';
    }
}

function cargarOrdenEnFormulario(num) {
    document.getElementById('buscarOrdenInput').value = num;
    buscarOrden();
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

// Modal Exportar Excel
function abrirModalExportar() { document.getElementById('modalExportar').classList.remove('hidden'); }
function cerrarModalExportar() { document.getElementById('modalExportar').classList.add('hidden'); }

function descargarCSVFiltrado() {
    const desde = document.getElementById('exportFechaInicio').value;
    const hasta = document.getElementById('exportFechaFin').value;
    if (!desde || !hasta) {
        alert('Seleccioná ambas fechas.');
        return;
    }
    window.location.href = `/api/ordenes/exportar?desde=${desde}&hasta=${hasta}&marca=${MARCA_ACTUAL}`;
    cerrarModalExportar();
}

// Modal Stock
function abrirModalStock() { document.getElementById('modalStock').classList.remove('hidden'); }
function cerrarModalStock() { document.getElementById('modalStock').classList.add('hidden'); }

async function buscarParaCambiarStock(q) {
    const container = document.getElementById('resultadosCambioStock');
    if (!q || q.trim().length === 0) {
        container.classList.add('hidden');
        return;
    }

    const res = await fetch(`/api/productos/buscar?q=${encodeURIComponent(q)}&marca=${MARCA_ACTUAL}`);
    const productos = await res.json();

    if (productos.length === 0) {
        container.innerHTML = '<div class="p-2 text-xs text-slate-400">Sin resultados</div>';
    } else {
        container.innerHTML = productos.map(p => `
            <div onclick="seleccionarProdParaStock(${JSON.stringify(p).replace(/"/g, '&quot;')})" class="p-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800 text-xs text-white">
                <b>${p.nombre}</b> - ${p.variante || 'N/A'} ($${p.precio}) [Stock: ${p.stock}]
            </div>
        `).join('');
    }
    container.classList.remove('hidden');
}

function seleccionarProdParaStock(p) {
    document.getElementById('editStockProdId').value = p.id;
    document.getElementById('editStockProdNombre').textContent = p.nombre;
    document.getElementById('editStockProdVariante').textContent = `Variante: ${p.variante || 'N/A'}`;
    document.getElementById('editProdPrecio').value = p.precio;
    document.getElementById('editProdStock').value = p.stock;

    document.getElementById('resultadosCambioStock').classList.add('hidden');
    document.getElementById('detalleProdEditarStock').classList.remove('hidden');

    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function volverAtrasStock() {
    document.getElementById('detalleProdEditarStock').classList.add('hidden');
    document.getElementById('buscarStockInput').value = '';
    const btn = document.getElementById('btnGuardarStock');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
}

async function guardarNuevoStockCat() {
    const id = document.getElementById('editStockProdId').value;
    const precio = document.getElementById('editProdPrecio').value;
    const stock = document.getElementById('editProdStock').value;

    const res = await fetch(`/api/productos/${id}/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precio, stock })
    });

    const data = await res.json();
    if (data.success) {
        alert('Producto actualizado.');
        volverAtrasStock();
        cerrarModalStock();
    } else {
        alert('Error al actualizar.');
    }
}

// Modal Producto Manual
function abrirModalManual() { document.getElementById('modalManual').classList.remove('hidden'); }
function cerrarModalManual() { document.getElementById('modalManual').classList.add('hidden'); }

async function guardarProductoManual() {
    const nombre = document.getElementById('manualNombre').value;
    const variante = document.getElementById('manualVariante').value;
    const precio = document.getElementById('manualPrecio').value;

    if (!nombre || !precio) {
        alert('Nombre y precio son obligatorios.');
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
    } else {
        alert('Error al crear producto.');
    }
}

// Imprimir Etiqueta con Estados de Pago Personalizados
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
        subtituloMonto = `(Inc. envío $${costoEnvio.toFixed(2)})`;
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
                    <span class="value">${cliente}</span>
                </div>

                <div class="field">
                    <span class="label">Teléfono</span>
                    <span class="value">
                        <img src="/logos/whatsapp.png" class="icon-img" alt="WA" onerror="this.src='https://cdn-icons-png.flaticon.com/512/733/733585.png'">
                        ${telefono}
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

                <!-- Muestra del Total a Cobrar -->
                <div class="total-box">
                    <div>
                        <div class="total-title">Total a Cobrar</div>
                        ${subtituloMonto ? `<div style="font-size: 9px; color: #64748b;">${subtituloMonto}</div>` : ''}
                    </div>
                    <div class="total-monto">$${montoMostrar.toFixed(2)}</div>
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