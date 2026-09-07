/**
 * Generador de Presentación Ejecutiva y PDF para Panatech e Incanto.
 * Diseñado para diapositivas A4 Horizontal de alta definición, listas para exponer y exportar a PDF.
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

function generarHTMLPresentacion(ordenes = [], marca = 'panatech', desde = '', hasta = '') {
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

    // 1. CÁLCULO DE AGREGADOS Y MÉTRICAS
    let totalFacturado = 0;
    let totalEnvios = 0;
    let totalUnidades = 0;
    const productosMap = new Map();
    const pagosMap = new Map();
    const vendedoresMap = new Map();
    const entregasMap = { 'Retiro': { total: 0, cantidad: 0 }, 'Envio': { total: 0, cantidad: 0, costo: 0 } };
    const estadosMap = new Map();

    ordenes.forEach(o => {
        const monto = parseFloat(o.total) || 0;
        const envio = parseFloat(o.costo_envio) || 0;
        const estado = o.estado || 'Iniciado';
        const vendedor = o.vendedor || 'General';
        const pago = o.metodo_pago || 'Sin especificar';
        const modo = o.modo_entrega || 'Retiro';

        if (estado !== 'Cancelado') {
            totalFacturado += monto;
            totalEnvios += envio;
        }

        // Pagos
        if (!pagosMap.has(pago)) pagosMap.set(pago, { total: 0, count: 0 });
        pagosMap.get(pago).total += monto;
        pagosMap.get(pago).count += 1;

        // Vendedores
        if (!vendedoresMap.has(vendedor)) vendedoresMap.set(vendedor, { total: 0, count: 0 });
        vendedoresMap.get(vendedor).total += monto;
        vendedoresMap.get(vendedor).count += 1;

        // Entregas
        if (modo === 'Envio') {
            entregasMap['Envio'].total += monto;
            entregasMap['Envio'].cantidad += 1;
            entregasMap['Envio'].costo += envio;
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

    // Top 10 Productos
    const topProductos = Array.from(productosMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const maxProdTotal = topProductos.length > 0 ? topProductos[0].total : 1;

    // Desglose Pagos ordenados
    const pagosLista = Array.from(pagosMap.entries())
        .map(([nombre, d]) => ({ nombre, ...d, pct: totalFacturado > 0 ? ((d.total / totalFacturado) * 100).toFixed(1) : 0 }))
        .sort((a, b) => b.total - a.total);

    // Vendedores ordenados
    const vendedoresLista = Array.from(vendedoresMap.entries())
        .map(([nombre, d]) => ({ nombre, ...d, pct: totalFacturado > 0 ? ((d.total / totalFacturado) * 100).toFixed(1) : 0 }))
        .sort((a, b) => b.total - a.total);

    // Texto de Período
    let periodoTexto = 'Histórico Completo';
    if (desde && hasta) {
        periodoTexto = `${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
    } else if (desde) {
        periodoTexto = `Desde ${formatearFecha(desde)}`;
    } else if (hasta) {
        periodoTexto = `Hasta ${formatearFecha(hasta)}`;
    }

    const fechaHoyStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe Ejecutivo ${marcaNombre} - ${periodoTexto}</title>
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
        }

        /* Formato Diapositiva A4 Horizontal (297mm x 210mm) */
        .slide-page {
            width: 100%;
            max-width: 1180px;
            min-height: 780px;
            margin: 20px auto;
            background: #0f172a;
            border: 1px solid rgba(51, 65, 85, 0.7);
            border-radius: 20px;
            padding: 32px 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
            display: flex;
            flex-col;
            justify-content: space-between;
            position: relative;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
        }

        @media print {
            body {
                background: #0f172a !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .no-print {
                display: none !important;
            }
            .slide-page {
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                min-height: 100vh !important;
                page-break-after: always !important;
                break-after: page !important;
            }
        }
    </style>
</head>
<body class="p-4 sm:p-6 flex flex-col items-center">

    <!-- Barra de Control Flotante Superior (No imprimible) -->
    <div class="no-print sticky top-3 z-50 w-full max-w-5xl bg-slate-900/90 backdrop-blur border border-slate-700/80 p-3 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-300">📊 Informe Ejecutivo:</span>
            <span class="text-xs font-extrabold ${theme.accentText}">${marcaNombre}</span>
            <span class="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">${periodoTexto}</span>
        </div>

        <div class="flex items-center gap-2">
            <button onclick="descargarPDFDirecto()" id="btnDescargarPDF" class="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-95">
                📄 <span>Descargar PDF</span>
            </button>
            <button onclick="window.print()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5">
                🖨️ <span class="hidden sm:inline">Imprimir / Guardar</span>
            </button>
            <a href="/api/ordenes/exportar?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&marca=${marca}" class="bg-emerald-900/80 hover:bg-emerald-800 text-emerald-300 border border-emerald-600/40 font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1">
                📊 <span class="hidden sm:inline">Excel</span>
            </a>
            <a href="/app.html?marca=${marca}" class="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-2 rounded-xl text-xs transition font-semibold" title="Volver a la App">
                ✕
            </a>
        </div>
    </div>

    <!-- Indicador de Carga Generando PDF -->
    <div id="pdfLoadingIndicator" class="no-print hidden fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full text-center space-y-3 shadow-2xl">
            <div class="animate-spin text-4xl">⏳</div>
            <h3 class="text-sm font-bold text-white">Generando PDF de Presentación...</h3>
            <p class="text-xs text-slate-400">Compilando gráficos vectoriales y páginas en alta definición. La descarga comenzará en segundos.</p>
        </div>
    </div>

    <!-- CONTENEDOR DE DIAPOSITIVAS (Se exporta a PDF) -->
    <div id="presentacionContainer" class="w-full flex flex-col items-center">

        <!-- ==========================================
             DIAPOSITIVA 1: RESUMEN EJECUTIVO Y KPIS
             ========================================== -->
        <div class="slide-page flex flex-col justify-between">
            <!-- Header Diapositiva 1 -->
            <div>
                <div class="flex items-center justify-between border-b border-slate-700/80 pb-4 mb-6">
                    <div class="flex items-center gap-4">
                        <img src="${logoUrl}" alt="${marcaNombre}" class="w-12 h-12 rounded-xl object-contain bg-slate-950 p-1 border border-slate-700 shadow" onerror="this.src='${fallbackLogo}'">
                        <div>
                            <div class="flex items-center gap-2.5">
                                <h1 class="text-2xl font-black tracking-wide ${theme.accentText}">${marcaNombre}</h1>
                                <span class="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full ${theme.pillBg} border">Reporte Oficial</span>
                            </div>
                            <p class="text-xs text-slate-400 font-medium">${marcaSubtitulo}</p>
                        </div>
                    </div>

                    <div class="text-right">
                        <div class="text-sm font-black text-white uppercase tracking-wider">Informe Ejecutivo de Ventas</div>
                        <div class="text-xs text-slate-400 flex items-center justify-end gap-2 mt-0.5">
                            <span>📅 Período: <strong class="text-slate-200">${periodoTexto}</strong></span>
                            <span>•</span>
                            <span>Emitido: ${fechaHoyStr}</span>
                        </div>
                    </div>
                </div>

                <!-- 4 KPI Cards Principales -->
                <div class="grid grid-cols-4 gap-4 mb-6">
                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">💰</div>
                        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Total Facturado</div>
                        <div class="text-2xl font-black text-emerald-400 leading-tight">${formatearMoneda(totalFacturado)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">Ventas netas confirmadas</div>
                    </div>

                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">📋</div>
                        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Total Pedidos</div>
                        <div class="text-2xl font-black text-sky-400 leading-tight">${ordenes.length} <span class="text-xs font-semibold text-slate-400">órdenes</span></div>
                        <div class="text-[10px] text-slate-400 mt-1">${ordenesValidas} activas • ${estadosMap.get('Cancelado')?.count || 0} canceladas</div>
                    </div>

                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">🎯</div>
                        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ticket Promedio</div>
                        <div class="text-2xl font-black text-purple-400 leading-tight">${formatearMoneda(ticketPromedio)}</div>
                        <div class="text-[10px] text-slate-400 mt-1">Por orden concretada</div>
                    </div>

                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-lg relative overflow-hidden">
                        <div class="absolute -right-2 -bottom-2 text-4xl opacity-10">🛍️</div>
                        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Unidades Vendidas</div>
                        <div class="text-2xl font-black text-amber-400 leading-tight">${totalUnidades} <span class="text-xs font-semibold text-slate-400">artículos</span></div>
                        <div class="text-[10px] text-slate-400 mt-1">${productosMap.size} productos distintos</div>
                    </div>
                </div>

                <!-- Bloques de Análisis: Métodos de Pago + Logística -->
                <div class="grid grid-cols-2 gap-6">
                    <!-- Métodos de Pago -->
                    <div class="bg-slate-900/80 border border-slate-700/70 p-4 rounded-2xl shadow-md">
                        <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                💳 Recaudación por Método de Pago
                            </h3>
                            <span class="text-[11px] text-slate-400">${pagosLista.length} modalidades</span>
                        </div>

                        <div class="space-y-3">
                            ${pagosLista.map(p => `
                                <div>
                                    <div class="flex justify-between text-xs font-semibold mb-1">
                                        <span class="text-slate-200">${p.nombre} (${p.count} ops)</span>
                                        <span class="text-white font-bold">${formatearMoneda(p.total)} <strong class="${theme.accentText} text-[10px]">(${p.pct}%)</strong></span>
                                    </div>
                                    <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                        <div class="${theme.accentBg} h-2 rounded-full transition-all" style="width: ${Math.min(100, Math.max(5, p.pct))}%"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Canales de Entrega y Logística -->
                    <div class="bg-slate-900/80 border border-slate-700/70 p-4 rounded-2xl shadow-md flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    🛵 Rendimiento Logístico y Envíos
                                </h3>
                                <span class="text-[11px] text-slate-400">Canales de entrega</span>
                            </div>

                            <div class="grid grid-cols-2 gap-3 mb-3">
                                <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-center">
                                    <div class="text-lg">🛍️</div>
                                    <div class="text-[10px] text-slate-400 uppercase font-bold mt-1">Retiro en Local</div>
                                    <div class="text-base font-black text-white">${entregasMap['Retiro'].cantidad} pedidos</div>
                                    <div class="text-[11px] text-slate-300 font-semibold">${formatearMoneda(entregasMap['Retiro'].total)}</div>
                                </div>

                                <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-center">
                                    <div class="text-lg">🛵</div>
                                    <div class="text-[10px] text-slate-400 uppercase font-bold mt-1">Envíos a Domicilio</div>
                                    <div class="text-base font-black text-white">${entregasMap['Envio'].cantidad} envíos</div>
                                    <div class="text-[11px] text-slate-300 font-semibold">${formatearMoneda(entregasMap['Envio'].total)}</div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                            <span class="text-slate-400 font-medium">Recaudación por Cadetería / Fletes:</span>
                            <span class="font-extrabold text-amber-400 text-sm">${formatearMoneda(totalEnvios)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer Diapositiva 1 -->
            <div class="border-t border-slate-800 pt-3 flex justify-between items-center text-[10px] text-slate-500">
                <span>${marcaNombre} • Sistema de Gestión de Ventas</span>
                <span>Documento Confidencial para Presentación Ejecutiva</span>
                <span>Diapositiva 1 de 3</span>
            </div>
        </div>


        <!-- ==========================================
             DIAPOSITIVA 2: TOP 10 PRODUCTOS DESTACADOS
             ========================================== -->
        <div class="slide-page flex flex-col justify-between">
            <div>
                <!-- Header Diapositiva 2 -->
                <div class="flex items-center justify-between border-b border-slate-700/80 pb-3 mb-4">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl p-2 rounded-xl bg-slate-900 border border-slate-700">🏆</div>
                        <div>
                            <h2 class="text-xl font-black text-white tracking-wide">Top 10 Productos Más Vendidos</h2>
                            <p class="text-xs text-slate-400">Ranking por volumen de facturación y unidades despachadas</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-bold ${theme.accentText} bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                            ${totalUnidades} unidades totales en el período
                        </span>
                    </div>
                </div>

                <!-- Tabla Visual de Productos -->
                <div class="bg-slate-900/90 border border-slate-700/70 rounded-2xl overflow-hidden shadow-xl mb-3">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-950 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                <th class="py-2.5 px-3 text-center w-12">Puesto</th>
                                <th class="py-2.5 px-3">Producto / Variante</th>
                                <th class="py-2.5 px-3 text-center">Unidades</th>
                                <th class="py-2.5 px-3 text-right">Facturación</th>
                                <th class="py-2.5 px-4 w-44">Participación</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-800/80">
                            ${topProductos.map((p, idx) => {
                                const rank = idx + 1;
                                const pctTotal = totalFacturado > 0 ? ((p.total / totalFacturado) * 100).toFixed(1) : 0;
                                const barWidth = ((p.total / maxProdTotal) * 100).toFixed(0);

                                let medal = `#${rank}`;
                                if (rank === 1) medal = '🥇 #1';
                                if (rank === 2) medal = '🥈 #2';
                                if (rank === 3) medal = '🥉 #3';

                                return `
                                    <tr class="hover:bg-slate-800/50 transition">
                                        <td class="py-2 px-3 text-center font-extrabold text-[11px] ${rank <= 3 ? theme.accentText : 'text-slate-400'}">
                                            ${medal}
                                        </td>
                                        <td class="py-2 px-3">
                                            <div class="font-bold text-white text-xs">${p.nombre}</div>
                                            <div class="text-[10px] text-slate-400 font-medium">${p.variante !== 'Única' ? `Variante: ${p.variante}` : 'Variante Única'}</div>
                                        </td>
                                        <td class="py-2 px-3 text-center font-bold text-slate-200">
                                            ${p.cantidad} u.
                                        </td>
                                        <td class="py-2 px-3 text-right font-black text-emerald-400 text-xs">
                                            ${formatearMoneda(p.total)}
                                        </td>
                                        <td class="py-2 px-4">
                                            <div class="flex items-center gap-2">
                                                <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                                    <div class="${theme.accentBg} h-2 rounded-full" style="width: ${Math.max(5, barWidth)}%"></div>
                                                </div>
                                                <span class="text-[10px] font-bold text-slate-300 w-9 text-right">${pctTotal}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <!-- Conclusión del Top 3 -->
                <div class="bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs text-slate-300">
                    <span>💡 <strong>Dato Clave:</strong> Los 3 productos líderes representan el <strong>${topProductos.slice(0, 3).reduce((acc, p) => acc + (totalFacturado > 0 ? (p.total / totalFacturado * 100) : 0), 0).toFixed(1)}%</strong> de los ingresos totales de este período.</span>
                    <span class="text-[11px] text-slate-400">Total ítems analizados: ${productosMap.size}</span>
                </div>
            </div>

            <!-- Footer Diapositiva 2 -->
            <div class="border-t border-slate-800 pt-3 flex justify-between items-center text-[10px] text-slate-500">
                <span>${marcaNombre} • Rendimiento de Catálogo</span>
                <span>Documento Confidencial para Presentación Ejecutiva</span>
                <span>Diapositiva 2 de 3</span>
            </div>
        </div>


        <!-- ==========================================
             DIAPOSITIVA 3: EQUIPO COMERCIAL Y OPERACIONES
             ========================================== -->
        <div class="slide-page flex flex-col justify-between">
            <div>
                <!-- Header Diapositiva 3 -->
                <div class="flex items-center justify-between border-b border-slate-700/80 pb-3 mb-6">
                    <div class="flex items-center gap-3">
                        <div class="text-2xl p-2 rounded-xl bg-slate-900 border border-slate-700">👥</div>
                        <div>
                            <h2 class="text-xl font-black text-white tracking-wide">Desempeño Comercial y Operativo</h2>
                            <p class="text-xs text-slate-400">Rendimiento por vendedor, estado de los pedidos y conclusiones operativas</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-bold text-slate-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                            ${vendedoresLista.length} vendedores activos
                        </span>
                    </div>
                </div>

                <!-- Grid: Vendedores + Estados de Órdenes -->
                <div class="grid grid-cols-2 gap-6 mb-6">
                    <!-- Rendimiento por Vendedor -->
                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-md">
                        <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                            <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                💼 Ventas por Vendedor
                            </h3>
                            <span class="text-[11px] text-slate-400">Total operaciones</span>
                        </div>

                        <div class="space-y-3">
                            ${vendedoresLista.map(v => {
                                const ticketVendedor = v.count > 0 ? (v.total / v.count) : 0;
                                return `
                                    <div class="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
                                        <div class="flex justify-between items-center mb-1.5">
                                            <span class="font-bold text-white text-xs">${v.nombre}</span>
                                            <span class="font-black text-emerald-400 text-xs">${formatearMoneda(v.total)}</span>
                                        </div>
                                        <div class="flex justify-between text-[10px] text-slate-400 mb-1.5">
                                            <span>${v.count} pedidos concretados</span>
                                            <span>Ticket prom: ${formatearMoneda(ticketVendedor)}</span>
                                            <span class="font-bold ${theme.accentText}">${v.pct}% del total</span>
                                        </div>
                                        <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                            <div class="${theme.accentBg} h-1.5 rounded-full" style="width: ${Math.max(5, v.pct)}%"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Estado Operativo de Pedidos -->
                    <div class="bg-slate-900/90 border border-slate-700/70 p-4 rounded-2xl shadow-md flex flex-col justify-between">
                        <div>
                            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                    🔄 Estado Operativo de Órdenes
                                </h3>
                                <span class="text-[11px] text-slate-400">${ordenes.length} registradas</span>
                            </div>

                            <div class="grid grid-cols-2 gap-2.5 mb-4">
                                <div class="bg-amber-950/40 border border-amber-700/60 p-2.5 rounded-xl text-center">
                                    <div class="text-[10px] text-amber-300 font-bold uppercase">🟡 Iniciado</div>
                                    <div class="text-lg font-black text-amber-400">${estadosMap.get('Iniciado')?.count || 0}</div>
                                </div>
                                <div class="bg-blue-950/40 border border-blue-700/60 p-2.5 rounded-xl text-center">
                                    <div class="text-[10px] text-blue-300 font-bold uppercase">🔵 Abonado</div>
                                    <div class="text-lg font-black text-blue-400">${estadosMap.get('Abonado')?.count || 0}</div>
                                </div>
                                <div class="bg-purple-950/40 border border-purple-700/60 p-2.5 rounded-xl text-center">
                                    <div class="text-[10px] text-purple-300 font-bold uppercase">🟣 Preparado</div>
                                    <div class="text-lg font-black text-purple-400">${estadosMap.get('Preparado')?.count || 0}</div>
                                </div>
                                <div class="bg-emerald-950/40 border border-emerald-700/60 p-2.5 rounded-xl text-center">
                                    <div class="text-[10px] text-emerald-300 font-bold uppercase">🟢 Finalizado</div>
                                    <div class="text-lg font-black text-emerald-400">${estadosMap.get('Finalizado')?.count || 0}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Resumen de Conclusiones -->
                        <div class="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                            <div class="font-bold text-white flex items-center gap-1.5">
                                <span>📌 Conclusiones Ejecutivas</span>
                            </div>
                            <p class="text-slate-300 text-[11px] leading-relaxed">
                                • El negocio generó un promedio de <strong>${formatearMoneda(ticketPromedio)}</strong> por operación.<br>
                                • El método de pago principal fue <strong>${pagosLista[0]?.nombre || 'S/D'}</strong> con un <strong>${pagosLista[0]?.pct || 0}%</strong> del volumen total.<br>
                                • Las entregas se distribuyeron en un <strong>${((entregasMap['Envio'].cantidad / (ordenes.length || 1)) * 100).toFixed(0)}%</strong> por envío y <strong>${((entregasMap['Retiro'].cantidad / (ordenes.length || 1)) * 100).toFixed(0)}%</strong> por retiro en local.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer Diapositiva 3 -->
            <div class="border-t border-slate-800 pt-3 flex justify-between items-center text-[10px] text-slate-500">
                <span>${marcaNombre} • Auditoría y Control Comercial</span>
                <span>Documento Confidencial para Presentación Ejecutiva</span>
                <span>Diapositiva 3 de 3</span>
            </div>
        </div>

    </div>

    <!-- Script de Descarga de PDF con html2pdf.js -->
    <script>
        async function descargarPDFDirecto() {
            const btn = document.getElementById('btnDescargarPDF');
            const loader = document.getElementById('pdfLoadingIndicator');
            if (loader) loader.classList.remove('hidden');

            const elemento = document.getElementById('presentacionContainer');
            const filename = 'Informe_Ejecutivo_${marcaNombre}_' + (new Date().toISOString().split('T')[0]) + '.pdf';

            const opt = {
                margin:       [4, 4, 4, 4],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            try {
                await html2pdf().set(opt).from(elemento).save();
            } catch (err) {
                console.error('Error al exportar PDF:', err);
                alert('No se pudo generar el PDF automáticamente. Utilizá el botón "Imprimir / Guardar" para guardarlo como PDF.');
            } finally {
                if (loader) loader.classList.add('hidden');
            }
        }

        // Auto-descargar si viene con parámetro autoPdf=1
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autoPdf') === '1' || urlParams.get('autoPdf') === 'true') {
            window.addEventListener('load', () => {
                setTimeout(descargarPDFDirecto, 800);
            });
        }
    </script>
</body>
</html>`;
}

module.exports = { generarHTMLPresentacion };
