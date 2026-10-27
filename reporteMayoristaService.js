/**
 * Servicio de Generación de Informes Ejecutivos en PDF para Incanto Mayorista
 * Diseñado con estética premium, KPIs ejecutivos, gráficos de torta (Pie Charts con SVG/Canvas nativo),
 * balance de Compras vs Ventas, inventario con cotización MEP y listado de transacciones.
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

function generarHTMLReporteMayorista({ transacciones = [], productos = [], cotizacionMep = 1540, desde = '', hasta = '', usuario = '' }) {
    // 1. Cálculos de Ventas y Compras
    const ventas = transacciones.filter(t => t.tipo === 'venta');
    const compras = transacciones.filter(t => t.tipo === 'compra');

    const totalVentas = ventas.reduce((acc, v) => acc + (parseFloat(v.total) || 0), 0);
    const totalCompras = compras.reduce((acc, c) => acc + (parseFloat(c.total) || 0), 0);
    const margenBruto = totalVentas - totalCompras;
    const ticketPromedioVenta = ventas.length > 0 ? (totalVentas / ventas.length) : 0;

    // 2. Stock y Splashes
    let totalStockMayorista = 0;
    let totalSplashUnidades = 0;
    let valorEstimadoStockArs = 0;

    productos.forEach(p => {
        const stock = parseInt(p.stock) || 0;
        const precio = parseFloat(p.precio) || 0;
        totalStockMayorista += stock;
        if (stock > 0) valorEstimadoStockArs += (stock * precio);
        if ((p.nombre || '').toLowerCase().includes('splash')) {
            totalSplashUnidades += stock;
        }
    });

    const valorEstimadoStockUsd = cotizacionMep > 0 ? (valorEstimadoStockArs / cotizacionMep) : 0;

    // 3. Distribución de Ventas por Producto para Gráfico de Torta (soporta ventas multi-producto)
    const productosVentasMap = new Map();
    ventas.forEach(v => {
        if (Array.isArray(v.items) && v.items.length > 0) {
            v.items.forEach(it => {
                const prod = it.producto_nombre || 'Otros';
                const cant = parseInt(it.cantidad) || 1;
                const unit = parseFloat(it.precio_unitario) || 0;
                const monto = parseFloat(it.subtotal) || (cant * unit);
                if (!productosVentasMap.has(prod)) {
                    productosVentasMap.set(prod, { total: 0, cantidad: 0 });
                }
                productosVentasMap.get(prod).total += monto;
                productosVentasMap.get(prod).cantidad += cant;
            });
        } else {
            const prod = v.producto || 'Otros';
            const monto = parseFloat(v.total) || 0;
            const cant = parseInt(v.cantidad) || 1;
            if (!productosVentasMap.has(prod)) {
                productosVentasMap.set(prod, { total: 0, cantidad: 0 });
            }
            productosVentasMap.get(prod).total += monto;
            productosVentasMap.get(prod).cantidad += cant;
        }
    });

    const productosRanking = Array.from(productosVentasMap.entries())
        .map(([nombre, datos]) => ({ nombre, ...datos }))
        .sort((a, b) => b.total - a.total);

    // Preparar datos para Gráfico de Torta 1 (Top Productos)
    const top4 = productosRanking.slice(0, 4);
    const otrosTotal = productosRanking.slice(4).reduce((acc, p) => acc + p.total, 0);
    const otrosCantidad = productosRanking.slice(4).reduce((acc, p) => acc + p.cantidad, 0);

    const pieProductosData = [...top4];
    if (otrosTotal > 0) {
        pieProductosData.push({ nombre: 'Otros Productos', total: otrosTotal, cantidad: otrosCantidad });
    }

    // Colores para Gráfico de Torta
    const paletaColores = ['#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];

    // Período de análisis formateado
    let periodoTexto = 'Historial Completo';
    if (desde && hasta) {
        periodoTexto = `${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
    } else if (desde) {
        periodoTexto = `Desde ${formatearFecha(desde)}`;
    } else if (hasta) {
        periodoTexto = `Hasta ${formatearFecha(hasta)}`;
    }

    const fechaHoyStr = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: 'short', year: 'numeric' });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Informe Ejecutivo - Incanto Mayorista</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <!-- Chart.js para Gráficos de Torta de alta resolución -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #0b1120;
            color: #f1f5f9;
            margin: 0;
            padding: 0;
            -webkit-tap-highlight-color: transparent;
        }

        .report-card {
            background: #0f172a;
            border: 1px solid rgba(236, 72, 153, 0.25);
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
                border: 1px solid rgba(236, 72, 153, 0.4) !important;
                box-shadow: none !important;
                margin-bottom: 12px !important;
            }
        }
    </style>
</head>
<body class="p-2 sm:p-4 md:p-6 flex flex-col items-center">

    <!-- BARRA FLOTANTE DE CONTROL (NO SE IMPRIME EN PDF) -->
    <header class="no-print sticky top-2 z-50 w-full max-w-4xl bg-slate-900/95 backdrop-blur-md border border-pink-500/40 p-2.5 sm:p-3.5 rounded-2xl shadow-2xl mb-3 sm:mb-4">
        <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
                <a href="/app.html?marca=incanto&usuario=${encodeURIComponent(usuario)}" class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0" title="Volver a la App">
                    ← <span class="hidden sm:inline">Volver</span>
                </a>
                <div class="min-w-0">
                    <div class="text-xs sm:text-sm font-extrabold text-pink-400 flex items-center gap-1.5 truncate">
                        <span>💎 Incanto Mayorista</span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-semibold truncate" title="${periodoTexto}">
                        📅 ${periodoTexto}
                    </div>
                </div>
            </div>

            <!-- Botón de Descarga -->
            <div class="flex items-center gap-2 shrink-0">
                <button type="button" onclick="descargarPDFDirecto()" id="btnDescargarPDF" class="bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-lg transition flex items-center gap-1.5 active:scale-95">
                    📄 <span>PDF</span>
                </button>
            </div>
        </div>
    </header>

    <!-- CONTENEDOR DEL INFORME EXPORTABLE -->
    <div id="reporteContenedor" class="w-full max-w-4xl space-y-3.5 sm:space-y-4">

        <!-- 1. ENCABEZADO EJECUTIVO / IDENTIDAD DE MARCA -->
        <section class="report-card p-4 sm:p-5 bg-gradient-to-r from-pink-950 via-slate-900 to-purple-950 border border-pink-500/40">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-2xl sm:text-3xl shadow-inner shrink-0">
                        💎
                    </div>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <h1 class="text-lg sm:text-2xl font-black text-white tracking-wide">INCANTO MAYORISTA</h1>
                            <span class="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                                Stock Independiente
                            </span>
                        </div>
                        <p class="text-[10px] sm:text-xs text-slate-400 font-medium">Informe Ejecutivo de Gestión, Compras, Ventas e Inventario</p>
                    </div>
                </div>

                <div class="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80 shrink-0">
                    <div class="text-[10px] sm:text-xs font-black text-pink-300 uppercase tracking-wider">Período de Análisis</div>
                    <div class="text-xs sm:text-sm font-extrabold text-white mt-0.5 break-words">${periodoTexto}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5">Emisión: ${fechaHoyStr}</div>
                </div>
            </div>
        </section>

        <!-- 2. TARJETAS KPI PRINCIPALES -->
        <section class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
            <!-- Ventas Totales -->
            <div class="report-card p-3.5 relative overflow-hidden">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Ventas</div>
                <div class="text-lg sm:text-2xl font-black text-emerald-400 mt-1 leading-none">${formatearMoneda(totalVentas)}</div>
                <div class="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
                    <span>${ventas.length} operaciones</span>
                    <span class="text-emerald-400 font-bold">Ingresos</span>
                </div>
            </div>

            <!-- Compras Totales -->
            <div class="report-card p-3.5 relative overflow-hidden">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Compras</div>
                <div class="text-lg sm:text-2xl font-black text-rose-400 mt-1 leading-none">${formatearMoneda(totalCompras)}</div>
                <div class="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
                    <span>${compras.length} ingresos</span>
                    <span class="text-rose-400 font-bold">Egresos</span>
                </div>
            </div>

            <!-- Stock Splash -->
            <div class="report-card p-3.5 relative overflow-hidden">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cantidad de Splash</div>
                <div class="text-lg sm:text-2xl font-black text-pink-400 mt-1 leading-none">${totalSplashUnidades} <span class="text-xs font-semibold text-slate-400">unidades</span></div>
                <div class="text-[10px] text-slate-400 mt-1.5">
                    <span>De ${totalStockMayorista} productos totales</span>
                </div>
            </div>

            <!-- Valor Estimado MEP -->
            <div class="report-card p-3.5 relative overflow-hidden">
                <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Valor Stock en u$d</div>
                <div class="text-lg sm:text-2xl font-black text-sky-400 mt-1 leading-none">u$d ${valorEstimadoStockUsd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="text-[10px] text-slate-400 mt-1.5">
                    <span>MEP: $${cotizacionMep.toFixed(2)} (${formatearMoneda(valorEstimadoStockArs)})</span>
                </div>
            </div>
        </section>

        <!-- 3. GRÁFICOS DE TORTA (PIE CHARTS) Y BALANCE -->
        <section class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            
            <!-- Gráfico de Torta 1: Distribución de Ventas por Producto -->
            <div class="report-card p-4 flex flex-col justify-between">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>🥧</span> Ventas por Producto
                    </h2>
                    <span class="text-[10px] text-slate-400 font-medium">${productosRanking.length} artículos</span>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-center gap-4 py-2">
                    <div class="w-40 h-40 relative flex-shrink-0">
                        <canvas id="chartPieProductos"></canvas>
                    </div>

                    <!-- Leyenda del gráfico -->
                    <div class="flex-1 space-y-1.5 w-full text-xs">
                        ${pieProductosData.length === 0 ? '<p class="text-slate-400 text-center text-xs">Sin ventas registradas en el período.</p>' : 
                        pieProductosData.map((item, idx) => {
                            const pct = totalVentas > 0 ? ((item.total / totalVentas) * 100).toFixed(1) : 0;
                            const color = paletaColores[idx % paletaColores.length];
                            return `
                                <div class="flex items-center justify-between bg-slate-900/70 p-1.5 rounded-lg border border-slate-800">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                                        <span class="text-slate-200 truncate font-semibold">${item.nombre}</span>
                                    </div>
                                    <div class="text-right flex-shrink-0 ml-2">
                                        <span class="font-bold text-white">${pct}%</span>
                                        <span class="text-[10px] text-slate-400 block">${formatearMoneda(item.total)}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>

            <!-- Gráfico de Torta 2: Balance Ventas vs Compras -->
            <div class="report-card p-4 flex flex-col justify-between">
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <span>⚖️</span> Balance Ventas vs Compras
                    </h2>
                    <span class="text-[10px] text-slate-400 font-medium">Flujo Operativo</span>
                </div>

                <div class="flex flex-col sm:flex-row items-center justify-center gap-4 py-2">
                    <div class="w-40 h-40 relative flex-shrink-0">
                        <canvas id="chartPieBalance"></canvas>
                    </div>

                    <!-- Métricas del Balance -->
                    <div class="flex-1 space-y-2 w-full text-xs">
                        <div class="bg-slate-900/70 p-2 rounded-xl border border-emerald-500/30">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-emerald-400">🛍️ Ventas Facturadas</span>
                                <span class="font-black text-white">${formatearMoneda(totalVentas)}</span>
                            </div>
                            <span class="text-[10px] text-slate-400 block mt-0.5">${ventas.length} pedidos realizados</span>
                        </div>

                        <div class="bg-slate-900/70 p-2 rounded-xl border border-rose-500/30">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-rose-400">📥 Compras a Proveedores</span>
                                <span class="font-black text-white">${formatearMoneda(totalCompras)}</span>
                            </div>
                            <span class="text-[10px] text-slate-400 block mt-0.5">${compras.length} ingresos de mercadería</span>
                        </div>

                        <div class="bg-slate-900/90 p-2 rounded-xl border ${margenBruto >= 0 ? 'border-sky-500/40 text-sky-300' : 'border-amber-500/40 text-amber-300'}">
                            <div class="flex justify-between items-center">
                                <span class="font-bold">Margen / Flujo Neto</span>
                                <span class="font-black text-base">${formatearMoneda(margenBruto)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </section>

        <!-- 4. TOP PRODUCTOS EN VENTAS Y TICKET PROMEDIO -->
        <section class="report-card p-4 sm:p-5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3.5">
                <div class="flex items-center gap-2">
                    <span class="text-base">🏆</span>
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Ranking de Productos Vendidos</h2>
                </div>
                <span class="text-[11px] text-slate-400 font-medium">Ticket promedio venta: <strong>${formatearMoneda(ticketPromedioVenta)}</strong></span>
            </div>

            ${productosRanking.length === 0 ? '<p class="text-slate-400 text-xs italic text-center p-3">No hay productos vendidos en el rango seleccionado.</p>' : `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    ${productosRanking.slice(0, 8).map((p, idx) => `
                        <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center">
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">#${idx + 1}</span>
                                    <strong class="text-white truncate">${p.nombre}</strong>
                                </div>
                                <span class="text-[10px] text-slate-400 mt-0.5 block">${p.cantidad} unidades despachadas</span>
                            </div>
                            <div class="text-right ml-2 flex-shrink-0">
                                <span class="font-black text-emerald-400 block">${formatearMoneda(p.total)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </section>

        <!-- 5. HISTORIAL DE TRANSACCIONES DETALLADO -->
        <section class="report-card p-4 sm:p-5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                <div class="flex items-center gap-2">
                    <span class="text-base">📋</span>
                    <h2 class="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Detalle de Transacciones del Período</h2>
                </div>
                <span class="text-[10px] text-slate-400">${transacciones.length} registros</span>
            </div>

            <div class="space-y-1.5 max-h-96 overflow-y-auto pr-1 text-xs">
                ${transacciones.length === 0 ? '<p class="text-slate-400 text-xs italic text-center p-4">No se encontraron transacciones en las fechas indicadas.</p>' : 
                transacciones.map(t => {
                    const esVenta = t.tipo === 'venta';
                    const colorBadge = esVenta ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                    const signo = esVenta ? '+' : '-';
                    const colorMonto = esVenta ? 'text-rose-400' : 'text-emerald-400';

                    return `
                        <div class="bg-slate-900/70 border border-slate-800 p-2 rounded-xl flex items-center justify-between">
                            <div class="space-y-0.5 min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[9px] font-mono px-1 py-0.5 rounded border ${colorBadge}">${t.numero}</span>
                                    <strong class="text-white truncate">${t.persona || (esVenta ? 'Cliente' : 'Proveedor')}</strong>
                                </div>
                                <div class="text-[10px] text-slate-400">
                                    📦 ${t.producto} • <strong>${t.cantidad} un.</strong> • ${formatearFecha(t.fecha)}
                                </div>
                            </div>
                            <div class="text-right ml-2 flex-shrink-0">
                                <div class="font-black ${colorMonto}">${signo}${formatearMoneda(t.total)}</div>
                                <span class="text-[9px] text-slate-500">${t.vendedor || 'sistema'}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </section>

        <!-- FOOTER DEL REPORTE -->
        <footer class="text-center text-[10px] text-slate-500 pt-2 pb-6 border-t border-slate-800">
            Incanto Mayorista • Sistema Registrador de Ventas • Documento de Gestión Interna • Generado ${fechaHoyStr}
        </footer>
    </div>

    <!-- SCRIPT DE RENDERIZADO DE GRÁFICOS Y DESCARGA PDF -->
    <script>
        // 1. Gráfico de Torta: Ventas por Producto
        const ctxPieProd = document.getElementById('chartPieProductos')?.getContext('2d');
        if (ctxPieProd) {
            const labelsProd = ${JSON.stringify(pieProductosData.map(p => p.nombre))};
            const dataProd = ${JSON.stringify(pieProductosData.map(p => p.total))};
            const colorsProd = ${JSON.stringify(pieProductosData.map((_, i) => paletaColores[i % paletaColores.length]))};

            if (dataProd.length === 0 || dataProd.every(v => v === 0)) {
                labelsProd.push('Sin datos');
                dataProd.push(1);
                colorsProd.push('#334155');
            }

            new Chart(ctxPieProd, {
                type: 'doughnut',
                data: {
                    labels: labelsProd,
                    datasets: [{
                        data: dataProd,
                        backgroundColor: colorsProd,
                        borderWidth: 2,
                        borderColor: '#0f172a'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    cutout: '55%'
                }
            });
        }

        // 2. Gráfico de Torta: Balance Ventas vs Compras
        const ctxPieBal = document.getElementById('chartPieBalance')?.getContext('2d');
        if (ctxPieBal) {
            const totalV = ${totalVentas};
            const totalC = ${totalCompras};
            let labelsBal = ['Ventas', 'Compras'];
            let dataBal = [totalV, totalC];
            let colorsBal = ['#ec4899', '#10b981'];

            if (totalV === 0 && totalC === 0) {
                labelsBal = ['Sin operaciones'];
                dataBal = [1];
                colorsBal = ['#334155'];
            }

            new Chart(ctxPieBal, {
                type: 'doughnut',
                data: {
                    labels: labelsBal,
                    datasets: [{
                        data: dataBal,
                        backgroundColor: colorsBal,
                        borderWidth: 2,
                        borderColor: '#0f172a'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    cutout: '55%'
                }
            });
        }

        // 3. Exportación a PDF con html2pdf
        async function descargarPDFDirecto() {
            const btn = document.getElementById('btnDescargarPDF');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '⏳ Generando PDF...';
            }

            const elemento = document.getElementById('reporteContenedor');
            const filename = 'informe_incanto_mayorista_${desde || 'inicio'}_al_${hasta || 'hoy'}.pdf';

            const opt = {
                margin:       [6, 6, 6, 6],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { 
                    scale: 2, 
                    useCORS: true, 
                    letterRendering: true,
                    windowWidth: 1024
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
            };

            try {
                await html2pdf().set(opt).from(elemento).save();
            } catch (err) {
                console.error('Error al generar PDF:', err);
                window.print();
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '📄 <span>Descargar PDF</span>';
                }
            }
        }

        // Auto-descarga si viene con autoPdf=1
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('autoPdf') === '1' || urlParams.get('autoPdf') === 'true') {
            window.addEventListener('load', () => {
                setTimeout(descargarPDFDirecto, 900);
            });
        }
    </script>
</body>
</html>`;
}

module.exports = { generarHTMLReporteMayorista };
