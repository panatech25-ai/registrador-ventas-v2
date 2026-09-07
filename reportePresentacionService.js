/**
 * Generador de Informe Ejecutivo y de Gestión Interna para Panatech e Incanto.
 * Optimizado para navegación móvil fluida, control interactivo de fechas,
 * foco operativo en ventas, pedidos, productos y formas de entrega, y exportación a PDF A4.
 */

function formatearMoneda(val) {
    const num = parseFloat(val) || 0;
    return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearFecha(str) {
    if (!str) return '';
    const partes = str.split('T')[0].split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return str;
}

function generarHTMLPresentacion(ordenes = [], marca = 'panatech', desde = '', hasta = '', usuario = '') {
    const esIncanto = (marca || '').toLowerCase() === 'incanto';
    const marcaNombre = esIncanto ? 'INCANTO' : 'PANATECH';
    const marcaSubtitulo = esIncanto ? 'Cosmética, Fragancias y Belleza' : 'Tecnología, Audio y Bazar';
    const logoUrl = esIncanto ? '/logos/incanto.png' : '/logos/panatech.png';
    const fallbackLogo = esIncanto ? 'https://cdn-icons-png.flaticon.com/512/3050/3050239.png' : 'https://cdn-icons-png.flaticon.com/512/891/891462.png';

    // Colores corporativos según marca
    const theme = esIncanto ? {
        primary: '#be123c',       // rose-700
        primaryHover: '#9f1239',  // rose-800
        primaryLight: '#ffe4e6',  // rose-100
        accentText: 'text-rose-400',
        accentBg: 'bg-rose-600',
        accentBorder: 'border-rose-500/30',
        gradientHeader: 'from-rose-950 via-slate-900 to-slate-900',
        pillBg: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
        badgeRank: 'bg-rose-600/20 text-rose-300 border-rose-500/40'
    } : {
        primary: '#0284c7',       // sky-600
        primaryHover: '#0369a1',  // sky-700
        primaryLight: '#e0f2fe',  // sky-100
        accentText: 'text-sky-400',
        accentBg: 'bg-sky-600',
        accentBorder: 'border-sky-500/30',
        gradientHeader: 'from-sky-950 via-slate-900 to-slate-900',
        pillBg: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
        badgeRank: 'bg-sky-600/20 text-sky-300 border-sky-500/40'
    };

    // 1. CÁLCULO DE MÉTRICAS Y AGREGADOS OPERATIVOS
    let totalFacturado = 0;
    let totalEnvios = 0;
    let totalUnidades = 0;
    const productosMap = new Map();
    const pagosMap = new Map();
    const vendedoresMap = new Map();
    const cadetesMap = new Map();
    const entregasMap = { 
        'Retiro': { total: 0, cantidad: 0 }, 
        'Envio': { total: 0, cantidad: 0, costo: 0 } 
    };
    const estadosMap = new Map();

    ordenes.forEach(o => {
        const monto = parseFloat(o.total) || 0;
        const envio = parseFloat(o.costo_envio) || 0;
        const estado = o.estado || 'Iniciado';
        const vendedor = o.vendedor ? o.vendedor.trim() : 'General';
        const pago = o.metodo_pago ? o.metodo_pago.trim() : 'Sin especificar';
        const modo = o.modo_entrega ? o.modo_entrega.trim() : 'Retiro';
        const cadete = o.cadete ? o.cadete.trim() : 'Sin asignar';

        if (estado !== 'Cancelado') {
            totalFacturado += monto;
            totalEnvios += envio;
        }

        // Métodos de Pago
        if (!pagosMap.has(pago)) pagosMap.set(pago, { total: 0, count: 0 });
        pagosMap.get(pago).total += monto;
        pagosMap.get(pago).count += 1;

        // Vendedores
        if (!vendedoresMap.has(vendedor)) vendedoresMap.set(vendedor, { total: 0, count: 0 });
        vendedoresMap.get(vendedor).total += monto;
        vendedoresMap.get(vendedor).count += 1;

        // Formas de Entrega
        if (modo === 'Envio') {
            entregasMap['Envio'].total += monto;
            entregasMap['Envio'].cantidad += 1;
            entregasMap['Envio'].costo += envio;

            // Desglose por Cadete
            if (!cadetesMap.has(cadete)) cadetesMap.set(cadete, { envios: 0, totalEnviosMonto: 0 });
            cadetesMap.get(cadete).envios += 1;
            cadetesMap.get(cadete).totalEnviosMonto += envio;
        } else {
            entregasMap['Retiro'].total += monto;
            entregasMap['Retiro'].cantidad += 1;
        }

        // Estados
        if (!estadosMap.has(estado)) estadosMap.set(estado, { total: 0, count: 0 });
        estadosMap.get(estado).total += monto;
        estadosMap.get(estado).count += 1;

        // Productos
        (o.orden_detalles || []).forEach(d => {
            const nom = (d.productos && d.productos.nombre) ? d.productos.nombre : (d.nombre || 'Producto General');
            const variante = (d.productos && d.productos.variante) ? d.productos.variante : (d.variante || 'Única');
            const sku = (d.productos && d.productos.codigo_sku) ? d.productos.codigo_sku : 'S/SKU';
            const cant = parseInt(d.cantidad) || 1;
            const precio = parseFloat(d.precio_unitario) || 0;
            const sub = cant * precio;

            if (estado !== 'Cancelado') {
                totalUnidades += cant;
            }

            const key = `${nom}:::${variante}`;
            if (!productosMap.has(key)) {
                productosMap.set(key, { nombre: nom, variante, sku, cantidad: 0, total: 0 });
            }
            const item = productosMap.get(key);
            item.cantidad += cant;
            item.total += sub;
        });
    });

    const ordenesValidas = ordenes.filter(o => o.estado !== 'Cancelado').length;
    const ticketPromedio = ordenesValidas > 0 ? (totalFacturado / ordenesValidas) : 0;
    const costoPromedioEnvio = entregasMap['Envio'].cantidad > 0 ? (entregasMap['Envio'].costo / entregasMap['Envio'].cantidad) : 0;

    // Top 10 Productos Más Vendidos
    const topProductos = Array.from(productosMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const maxProdTotal = topProductos.length > 0 ? topProductos[0].total : 1;

    // Métodos de Pago Ordenados
    const pagosLista = Array.from(pagosMap.entries())
        .map(([nombre, d]) => ({ nombre, ...d, pct: totalFacturado > 0 ? ((d.total / totalFacturado) * 100).toFixed(1) : 0 }))
        .sort((a, b) => b.total - a.total);

    // Vendedores Ordenados
    const vendedoresLista = Array.from(vendedoresMap.entries())
        .map(([nombre, d]) => ({ nombre, ...d, pct: totalFacturado > 0 ? ((d.total / totalFacturado) * 100).toFixed(1) : 0 }))
        .sort((a, b) => b.total - a.total);

    // Cadetes Ordenados
    const cadetesLista = Array.from(cadetesMap.entries())
        .map(([nombre, d]) => ({ nombre, ...d }))
        .sort((a, b) => b.envios - a.envios);

    // Porcentaje de Retiro vs Envío
    const totalEntregas = entregasMap['Retiro'].cantidad + entregasMap['Envio'].cantidad || 1;
    const pctRetiro = ((entregasMap['Retiro'].cantidad / totalEntregas) * 100).toFixed(1);
    const pctEnvio = ((entregasMap['Envio'].cantidad / totalEntregas) * 100).toFixed(1);

    // Texto de Período
    let periodoTexto = 'Historial Completo';
    if (desde && hasta) {
        periodoTexto = `${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
    } else if (desde) {
        periodoTexto = `Desde ${formatearFecha(desde)}`;
    } else if (hasta) {
        periodoTexto = `Hasta ${formatearFecha(hasta)}`;
    }

    const fechaHoyStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Informe de Gestión ${marcaNombre} - ${periodoTexto}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #0b1120;
            color: #f1f5f9;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
        }

        /* Bloques de Página para A4 y Pantalla */
        .report-card {
            background: #0f172a;
            border: 1px solid rgba(51, 65, 85, 0.7);
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            page-break-inside: avoid;
            break-inside: avoid;
        }

        @media print {
            body {
                background: #0b1120 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .no-print {
                display: none !important;
            }
            .report-card {
                border: 1px solid #334155 !important;
                box-shadow: none !important;
                margin-bottom: 12px !important;
            }
        }
    </style>
</head>
<body class="p-2 sm:p-4 md:p-6 flex flex-col items-center">

    <!-- BARRA FLOTANTE DE CONTROL Y ACCIONES (Móvil y Escritorio) -->
    <header class="no-print sticky top-2 z-50 w-full max-w-4xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 p-2.5 sm:p-3.5 rounded-2xl shadow-2xl mb-3 sm:mb-4">
        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
                <a href="/app.html?marca=${marca}&usuario=${encodeURIComponent(usuario)}" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-xl text-xs font-bold transition flex items-center gap-1" title="Volver a la App">
                    ← <span class="hidden sm:inline">Volver</span>
                </a>
                <div>
                    <div class="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                        <span class="${theme.accentText}">📊 Gestión: ${marcaNombre}</span>
                    </div>
                    <div class="text-[10px] text-slate-400">${periodoTexto}</div>
                </div>
            </div>

            <!-- Botones de Acción -->
            <div class="flex items-center gap-1.5 sm:gap-2">
                <button type="button" onclick="toggleFiltroFechas()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl transition flex items-center gap-1">
                    📅 <span class="hidden sm:inline">Cambiar</span> Fechas
                </button>
                <button type="button" onclick="descargarPDFDirecto()" id="btnDescargarPDF" class="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-[11px] sm:text-xs px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl shadow-lg transition flex items-center gap-1 active:scale-95">
                    📄 <span>PDF</span>
                </button>
                <a href="/api/ordenes/exportar?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${marca}&usuario=${encodeURIComponent(usuario)}" class="bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-600/50 font-bold text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl transition flex items-center gap-1">
                    📊 <span class="hidden sm:inline">Excel</span>
                </a>
            </div>
        </div>

        <!-- PANEL DESPLEGABLE DE SELECTOR DE FECHAS (Totalmente interactivo) -->
        <div id="panelSelectorFechas" class="mt-3 pt-3 border-t border-slate-800 hidden space-y-2.5">
            <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Seleccionar Período de Análisis</span>
                <span class="text-[10px] text-slate-500">Filtrar métricas en tiempo real</span>
            </div>

            <!-- Accesos Rápidos -->
            <div class="grid grid-cols-4 gap-1.5">
                <button type="button" onclick="aplicarPresetFecha('hoy')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg border border-slate-700 font-semibold transition text-center">Hoy</button>
                <button type="button" onclick="aplicarPresetFecha('7dias')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg border border-slate-700 font-semibold transition text-center">7 Días</button>
                <button type="button" onclick="aplicarPresetFecha('mes')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg border border-slate-700 font-semibold transition text-center">Este Mes</button>
                <button type="button" onclick="aplicarPresetFecha('todo')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg border border-slate-700 font-semibold transition text-center">Todo</button>
            </div>

            <!-- Inputs Personalizados Desde / Hasta -->
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end pt-1">
                <div class="sm:col-span-2">
                    <label class="block text-[10px] text-slate-400 font-bold mb-1">Desde</label>
                    <input type="date" id="inputDesde" value="${desde}" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:border-sky-500">
                </div>
                <div class="sm:col-span-2">
                    <label class="block text-[10px] text-slate-400 font-bold mb-1">Hasta</label>
                    <input type="date" id="inputHasta" value="${hasta}" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:border-sky-500">
                </div>
                <div class="col-span-2 sm:col-span-1">
                    <button type="button" onclick="aplicarRangoPersonalizado()" class="w-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold py-2 px-3 rounded-lg shadow transition text-center active:scale-95">
                        Filtrar
                    </button>
                </div>
            </div>
        </div>
    </header>

    <!-- Indicador de Carga Generando PDF -->
    <div id="pdfLoadingIndicator" class="no-print hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full text-center space-y-3 shadow-2xl">
            <div class="animate-spin text-4xl">⏳</div>
            <h3 class="text-sm font-bold text-white">Generando Informe PDF...</h3>
            <p class="text-xs text-slate-400">Preparando páginas en formato ejecutivo. La descarga comenzará enseguida.</p>
        </div>
    </div>

    <!-- CONTENEDOR PRINCIPAL DEL INFORME (Optimizado para móvil y renderizado de PDF) -->
    <main id="reporteContainer" class="w-full max-w-4xl space-y-3 sm:space-y-4">

        <!-- ENCABEZADO EJECUTIVO / IDENTIDAD -->
        <section class="report-card p-4 sm:p-5 bg-gradient-to-r ${theme.gradientHeader}">
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <img src="${logoUrl}" alt="${marcaNombre}" class="w-11 h-11 sm:w-13 sm:h-13 rounded-xl object-contain bg-slate-950 p-1.5 border border-slate-700 shadow" onerror="this.src='${fallbackLogo}'">
                    <div>
                        <div class="flex items-center gap-2">
                            <h1 class="text-xl sm:text-2xl font-black text-white tracking-wide">${marcaNombre}</h1>
                            <span class="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${theme.pillBg} border">Gestión Interna</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-slate-400 font-medium">${marcaSubtitulo}</p>
                    </div>
                </div>

                <div class="text-right">
                    <div class="text-[11px] sm:text-xs font-extrabold text-slate-200">INFORME DE VENTAS</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">Emitido: ${fechaHoyStr}</div>
                    <div class="text-[10px] font-semibold ${theme.accentText} mt-0.5">${periodoTexto}</div>
                </div>
            </div>
        </section>

        <!-- SECCIÓN 1: FOCO EN LA VENTA Y CANTIDAD DE PEDIDOS (KPIs CLAVE) -->
        <section class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
            <!-- Total Facturado -->
            <div class="report-card p-3.5 sm:p-4 relative overflow-hidden">
                <div class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Facturado</div>
                <div class="text-xl sm:text-2xl font-black text-emerald-400 mt-1 leading-none">${formatearMoneda(totalFacturado)}</div>
                <div class="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
                    <span>Venta neta confirmada</span>
                </div>
            </div>

            <!-- Cantidad de Pedidos -->
            <div class="report-card p-3.5 sm:p-4 relative overflow-hidden">
                <div class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Cantidad Pedidos</div>
                <div class="text-xl sm:text-2xl font-black text-sky-400 mt-1 leading-none">${ordenes.length} <span class="text-xs font-semibold text-slate-400">órdenes</span></div>
                <div class="text-[10px] text-slate-400 mt-1.5">
                    <span class="text-emerald-400 font-bold">${ordenesValidas}</span> activas • <span class="text-rose-400 font-bold">${estadosMap.get('Cancelado')?.count || 0}</span> canc.
                </div>
            </div>

            <!-- Ticket Promedio -->
            <div class="report-card p-3.5 sm:p-4 relative overflow-hidden">
                <div class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Ticket Promedio</div>
                <div class="text-xl sm:text-2xl font-black text-purple-400 mt-1 leading-none">${formatearMoneda(ticketPromedio)}</div>
                <div class="text-[10px] text-slate-400 mt-1.5">
                    <span>Por orden concretada</span>
                </div>
            </div>

            <!-- Unidades Vendidas -->
            <div class="report-card p-3.5 sm:p-4 relative overflow-hidden">
                <div class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">Unidades Vendidas</div>
                <div class="text-xl sm:text-2xl font-black text-amber-400 mt-1 leading-none">${totalUnidades} <span class="text-xs font-semibold text-slate-400">artículos</span></div>
                <div class="text-[10px] text-slate-400 mt-1.5">
                    <span>${productosMap.size} productos distintos</span>
                </div>
            </div>
        </section>

        <!-- SECCIÓN 2: FORMAS DE ENTREGA Y LOGÍSTICA (FOCO OPERATIVO) -->
        <section class="report-card p-4 sm:p-5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3.5">
                <div class="flex items-center gap-2">
                    <span class="text-base">🛵</span>
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Formas de Entrega y Cadetería</h2>
                </div>
                <span class="text-[11px] text-slate-400 font-medium">${totalEntregas} entregas totales</span>
            </div>

            <!-- Barra Comparativa Visual: Retiro vs Envío -->
            <div class="mb-4">
                <div class="flex justify-between text-xs font-bold mb-1.5">
                    <span class="text-sky-300 flex items-center gap-1">🛍️ Retiro en Local: <b>${pctRetiro}%</b> (${entregasMap['Retiro'].cantidad} ops)</span>
                    <span class="text-amber-300 flex items-center gap-1">🛵 Envíos a Domicilio: <b>${pctEnvio}%</b> (${entregasMap['Envio'].cantidad} ops)</span>
                </div>
                <div class="w-full bg-slate-800 rounded-full h-3 flex overflow-hidden p-0.5 border border-slate-700/60">
                    <div class="bg-sky-500 h-full rounded-l-full transition-all" style="width: ${pctRetiro}%"></div>
                    <div class="bg-amber-500 h-full rounded-r-full transition-all" style="width: ${pctEnvio}%"></div>
                </div>
            </div>

            <!-- 3 Tarjetas de Detalle Logístico -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                    <div class="text-[10px] font-bold text-sky-400 uppercase tracking-wider mb-1">🛍️ Retiro en Tienda</div>
                    <div class="text-lg font-black text-white">${entregasMap['Retiro'].cantidad} <span class="text-xs font-medium text-slate-400">pedidos</span></div>
                    <div class="text-xs text-slate-300 font-bold mt-1">${formatearMoneda(entregasMap['Retiro'].total)}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">Venta presencial o retiro</div>
                </div>

                <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                    <div class="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">🛵 Envíos a Domicilio</div>
                    <div class="text-lg font-black text-white">${entregasMap['Envio'].cantidad} <span class="text-xs font-medium text-slate-400">pedidos</span></div>
                    <div class="text-xs text-slate-300 font-bold mt-1">${formatearMoneda(entregasMap['Envio'].total)}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">Despachos por cadete</div>
                </div>

                <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
                    <div class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">📦 Fletes Recaudados</div>
                    <div class="text-lg font-black text-emerald-400">${formatearMoneda(totalEnvios)}</div>
                    <div class="text-[11px] text-slate-300 font-bold mt-1">Promedio: ${formatearMoneda(costoPromedioEnvio)}</div>
                    <div class="text-[10px] text-slate-500 mt-0.5">Costo flete por entrega</div>
                </div>
            </div>

            <!-- Desglose por Cadete (si existen envíos) -->
            ${cadetesLista.length > 0 ? `
                <div class="mt-3.5 pt-3 border-t border-slate-800/80">
                    <div class="text-[11px] font-bold text-slate-300 mb-2">Desglose de Envíos por Cadete:</div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        ${cadetesLista.map(c => `
                            <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800 flex justify-between items-center">
                                <span class="font-bold text-slate-300 truncate">${c.nombre}</span>
                                <span class="font-extrabold text-amber-400 ml-1 shrink-0">${c.envios} envíos</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </section>

        <!-- SECCIÓN 3: PRODUCTOS MÁS VENDIDOS (RANKING Y MOVIMIENTO) -->
        <section class="report-card p-4 sm:p-5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3.5">
                <div class="flex items-center gap-2">
                    <span class="text-base">🏆</span>
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Top 10 Productos Más Vendidos</h2>
                </div>
                <span class="text-[11px] text-slate-400 font-medium">${totalUnidades} unidades despachadas</span>
            </div>

            <!-- Lista Adaptada para Móvil y Desktop -->
            <div class="space-y-2">
                ${topProductos.map((p, idx) => {
                    const rank = idx + 1;
                    const pctTotal = totalFacturado > 0 ? ((p.total / totalFacturado) * 100).toFixed(1) : 0;
                    const barWidth = ((p.total / maxProdTotal) * 100).toFixed(0);

                    let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
                    let rankIcon = `#${rank}`;
                    if (rank === 1) { badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/50'; rankIcon = '🥇 #1'; }
                    if (rank === 2) { badgeColor = 'bg-slate-300/20 text-slate-200 border-slate-300/50'; rankIcon = '🥈 #2'; }
                    if (rank === 3) { badgeColor = 'bg-amber-700/20 text-amber-400 border-amber-700/50'; rankIcon = '🥉 #3'; }

                    return `
                        <div class="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                            <div class="flex items-start justify-between gap-2 mb-1.5">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="text-[10px] font-black px-2 py-0.5 rounded-md border ${badgeColor} shrink-0">
                                        ${rankIcon}
                                    </span>
                                    <div class="min-w-0">
                                        <div class="text-xs font-bold text-white truncate">${p.nombre}</div>
                                        <div class="text-[10px] text-slate-400">${p.variante !== 'Única' ? `Variante: ${p.variante}` : 'Variante Única'}</div>
                                    </div>
                                </div>
                                <div class="text-right shrink-0">
                                    <div class="text-xs sm:text-sm font-black text-emerald-400">${formatearMoneda(p.total)}</div>
                                    <div class="text-[10px] font-bold text-amber-300">${p.cantidad} u. vendidas</div>
                                </div>
                            </div>

                            <!-- Barra de Progreso de Participación -->
                            <div class="flex items-center gap-2 mt-1">
                                <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                    <div class="${theme.accentBg} h-1.5 rounded-full" style="width: ${Math.max(5, barWidth)}%"></div>
                                </div>
                                <span class="text-[10px] font-bold text-slate-400 shrink-0 w-8 text-right">${pctTotal}%</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between items-center">
                <span>💡 El Top 3 concentra el <strong>${topProductos.slice(0, 3).reduce((acc, p) => acc + (totalFacturado > 0 ? (p.total / totalFacturado * 100) : 0), 0).toFixed(1)}%</strong> de la facturación.</span>
                <span class="text-[10px] text-slate-500">${productosMap.size} productos con ventas</span>
            </div>
        </section>

        <!-- SECCIÓN 4: MÉTODOS DE PAGO Y VENDEDORES (CONTROL INTERNO) -->
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <!-- Métodos de Pago -->
            <div class="report-card p-4">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>💳</span> Métodos de Pago
                    </h3>
                    <span class="text-[10px] text-slate-400">${pagosLista.length} formas</span>
                </div>

                <div class="space-y-2.5">
                    ${pagosLista.map(p => `
                        <div>
                            <div class="flex justify-between text-xs font-semibold mb-1">
                                <span class="text-slate-200">${p.nombre} (${p.count} ops)</span>
                                <span class="text-white font-bold">${formatearMoneda(p.total)} <span class="${theme.accentText} text-[10px]">(${p.pct}%)</span></span>
                            </div>
                            <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                                <div class="${theme.accentBg} h-2 rounded-full" style="width: ${Math.min(100, Math.max(5, p.pct))}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Rendimiento por Vendedor -->
            <div class="report-card p-4">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>💼</span> Ventas por Vendedor
                    </h3>
                    <span class="text-[10px] text-slate-400">${vendedoresLista.length} vendedores</span>
                </div>

                <div class="space-y-2">
                    ${vendedoresLista.map(v => {
                        const ticketV = v.count > 0 ? (v.total / v.count) : 0;
                        return `
                            <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                <div class="flex justify-between items-center text-xs">
                                    <span class="font-bold text-white">${v.nombre}</span>
                                    <span class="font-black text-emerald-400">${formatearMoneda(v.total)}</span>
                                </div>
                                <div class="flex justify-between text-[10px] text-slate-400 mt-0.5">
                                    <span>${v.count} pedidos</span>
                                    <span>Prom: ${formatearMoneda(ticketV)}</span>
                                    <span class="font-bold ${theme.accentText}">${v.pct}%</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </section>

        <!-- SECCIÓN 5: ESTADO OPERATIVO DE PEDIDOS -->
        <section class="report-card p-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <h3 class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>🔄</span> Estado Operativo del Período
                </h3>
                <span class="text-[10px] text-slate-400">${ordenes.length} registradas</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div class="bg-amber-950/40 border border-amber-700/50 p-2.5 rounded-xl text-center">
                    <div class="text-[10px] text-amber-300 font-bold uppercase">🟡 Iniciado</div>
                    <div class="text-lg font-black text-amber-400">${estadosMap.get('Iniciado')?.count || 0}</div>
                </div>
                <div class="bg-blue-950/40 border border-blue-700/50 p-2.5 rounded-xl text-center">
                    <div class="text-[10px] text-blue-300 font-bold uppercase">🔵 Abonado</div>
                    <div class="text-lg font-black text-blue-400">${estadosMap.get('Abonado')?.count || 0}</div>
                </div>
                <div class="bg-purple-950/40 border border-purple-700/50 p-2.5 rounded-xl text-center">
                    <div class="text-[10px] text-purple-300 font-bold uppercase">🟣 Preparado</div>
                    <div class="text-lg font-black text-purple-400">${estadosMap.get('Preparado')?.count || 0}</div>
                </div>
                <div class="bg-emerald-950/40 border border-emerald-700/50 p-2.5 rounded-xl text-center">
                    <div class="text-[10px] text-emerald-300 font-bold uppercase">🟢 Finalizado</div>
                    <div class="text-lg font-black text-emerald-400">${estadosMap.get('Finalizado')?.count || 0}</div>
                </div>
            </div>
        </section>

        <!-- FOOTER DE CONTROL INTERNO -->
        <footer class="text-center text-[10px] text-slate-500 py-3">
            <div>${marcaNombre} • Sistema de Gestión Comercial y Logística</div>
            <div class="mt-0.5">Informe Interno Generado el ${fechaHoyStr} • Confidencial</div>
        </footer>

    </main>

    <!-- SCRIPTS DE INTERACCIÓN, FILTRADO Y DESCARGA DE PDF -->
    <script>
        const MARCA_ACTUAL = "${marca}";
        const USUARIO_ACTUAL = "${usuario}";

        function toggleFiltroFechas() {
            const panel = document.getElementById('panelSelectorFechas');
            if (panel) {
                panel.classList.toggle('hidden');
            }
        }

        function aplicarPresetFecha(tipo) {
            const hoy = new Date();
            const hoyStr = hoy.toISOString().split('T')[0];
            let desde = '';
            let hasta = hoyStr;

            if (tipo === 'hoy') {
                desde = hoyStr;
            } else if (tipo === '7dias') {
                const hace7 = new Date();
                hace7.setDate(hoy.getDate() - 7);
                desde = hace7.toISOString().split('T')[0];
            } else if (tipo === 'mes') {
                const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                desde = primerDiaMes.toISOString().split('T')[0];
            } else if (tipo === 'todo') {
                desde = '';
                hasta = '';
            }

            irAFecha(desde, hasta);
        }

        function aplicarRangoPersonalizado() {
            const desde = document.getElementById('inputDesde').value;
            const hasta = document.getElementById('inputHasta').value;
            irAFecha(desde, hasta);
        }

        function irAFecha(desde, hasta) {
            let url = '/reporte-presentacion?marca=' + encodeURIComponent(MARCA_ACTUAL) + '&usuario=' + encodeURIComponent(USUARIO_ACTUAL);
            if (desde) url += '&desde=' + encodeURIComponent(desde);
            if (hasta) url += '&hasta=' + encodeURIComponent(hasta);
            window.location.href = url;
        }

        async function descargarPDFDirecto() {
            const loader = document.getElementById('pdfLoadingIndicator');
            if (loader) loader.classList.remove('hidden');

            const elemento = document.getElementById('reporteContainer');
            const filename = 'Informe_Gestion_${marcaNombre}_' + (new Date().toISOString().split('T')[0]) + '.pdf';

            const opt = {
                margin:       [6, 6, 6, 6],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { 
                    scale: 2, 
                    useCORS: true, 
                    letterRendering: true,
                    windowWidth: 1024 // Renderizado consistente tipo escritorio incluso si se pulsa desde celular
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            try {
                await html2pdf().set(opt).from(elemento).save();
            } catch (err) {
                console.error('Error al exportar PDF:', err);
                alert('No se pudo generar el PDF automáticamente. Utilizá el botón de impresión del navegador para guardarlo.');
            } finally {
                if (loader) loader.classList.add('hidden');
            }
        }

        // Auto-descarga si viene con autoPdf=1
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autoPdf') === '1' || urlParams.get('autoPdf') === 'true') {
            window.addEventListener('load', () => {
                setTimeout(descargarPDFDirecto, 700);
            });
        }
    </script>
</body>
</html>`;
}

module.exports = { generarHTMLPresentacion };
