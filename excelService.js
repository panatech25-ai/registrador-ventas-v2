const ExcelJS = require('exceljs');
const {
    obtenerMetadataMarca,
    guardarMetadataMarca,
    normalizeName
} = require('./panatechScraperService');

/**
 * Genera un informe completo y profesional de ventas en Excel con múltiples hojas y análisis profundo.
 * @param {Array} ordenes - Lista de órdenes con sus relaciones orden_detalles y productos
 * @param {string} marca - 'panatech' o 'incanto'
 * @param {string} desde - Fecha inicio YYYY-MM-DD
 * @param {string} hasta - Fecha fin YYYY-MM-DD
 * @returns {ExcelJS.Workbook}
 */
async function generarReporteVentasAvanzado(ordenes = [], marca = 'panatech', desde = '', hasta = '') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Registrador de Ventas';
    workbook.created = new Date();

    const esIncanto = marca.toLowerCase() === 'incanto';
    const marcaNombre = esIncanto ? 'INCANTO' : 'PANATECH';
    const colorPrimarioHex = esIncanto ? 'BE123C' : '0284C7'; // Rose 700 / Sky 600
    const colorSecundarioHex = esIncanto ? '9F1239' : '0369A1'; // Rose 800 / Sky 700
    const colorAcentoHex = esIncanto ? 'FDA4AF' : 'BAE6FD';
    const colorFondoClaroHex = esIncanto ? 'FFF1F2' : 'F0F9FF';

    // 1. CÁLCULO DE MÉTRICAS Y AGREGACIONES
    let totalFacturado = 0;
    let totalEnvios = 0;
    let totalUnidades = 0;
    const productosMap = new Map(); // key: nombre_variante -> { nombre, variante, cantidad, total }
    const pagosMap = new Map();     // key: metodo_pago -> { total, cantidad }
    const vendedoresMap = new Map();// key: vendedor -> { total, cantidad }
    const entregasMap = { 'Retiro': { total: 0, cantidad: 0 }, 'Envio': { total: 0, cantidad: 0, costoEnvio: 0 } };
    const diasMap = new Map();      // key: YYYY-MM-DD -> { total, cantidad }
    const estadosMap = new Map();   // key: estado -> { total, cantidad }

    const listaItemsDetalle = [];
    const listaEnvios = [];

    ordenes.forEach(o => {
        const montoTotal = parseFloat(o.total) || 0;
        const costoEnvio = parseFloat(o.costo_envio) || 0;
        const estado = o.estado || 'Iniciado';
        const vendedor = o.vendedor || 'Sin asignar';
        const metodoPago = o.metodo_pago || 'Sin especificar';
        const modoEntrega = o.modo_entrega || 'Retiro';
        const fechaStr = o.fecha ? (o.fecha.split('T')[0]) : 'S/D';

        totalFacturado += montoTotal;
        totalEnvios += costoEnvio;

        // Por Método de Pago
        if (!pagosMap.has(metodoPago)) pagosMap.set(metodoPago, { total: 0, cantidad: 0 });
        pagosMap.get(metodoPago).total += montoTotal;
        pagosMap.get(metodoPago).cantidad += 1;

        // Por Vendedor
        if (!vendedoresMap.has(vendedor)) vendedoresMap.set(vendedor, { total: 0, cantidad: 0 });
        vendedoresMap.get(vendedor).total += montoTotal;
        vendedoresMap.get(vendedor).cantidad += 1;

        // Por Modo Entrega
        if (modoEntrega === 'Envio') {
            entregasMap['Envio'].total += montoTotal;
            entregasMap['Envio'].cantidad += 1;
            entregasMap['Envio'].costoEnvio += costoEnvio;

            listaEnvios.push({
                numero_orden: o.numero_orden,
                fecha: fechaStr,
                cliente_nombre: o.cliente_nombre || '',
                cliente_telefono: o.cliente_telefono || '',
                direccion_envio: o.direccion_envio || '',
                cadete: o.cadete || 'No asignado',
                horario_envio: o.horario_envio || '',
                costo_envio: costoEnvio,
                total: montoTotal,
                estado: estado,
                metodo_pago: metodoPago
            });
        } else {
            entregasMap['Retiro'].total += montoTotal;
            entregasMap['Retiro'].cantidad += 1;
        }

        // Por Día
        if (!diasMap.has(fechaStr)) diasMap.set(fechaStr, { total: 0, cantidad: 0 });
        diasMap.get(fechaStr).total += montoTotal;
        diasMap.get(fechaStr).cantidad += 1;

        // Por Estado
        if (!estadosMap.has(estado)) estadosMap.set(estado, { total: 0, cantidad: 0 });
        estadosMap.get(estado).total += montoTotal;
        estadosMap.get(estado).cantidad += 1;

        // Detalle de Productos
        if (o.orden_detalles && Array.isArray(o.orden_detalles)) {
            o.orden_detalles.forEach(d => {
                const prodNombre = (d.productos && d.productos.nombre) ? d.productos.nombre : 'Producto Manual / Sin catálogo';
                const prodVariante = (d.productos && d.productos.variante) ? d.productos.variante : (d.variante || 'Única');
                const sku = (d.productos && d.productos.codigo_sku) ? d.productos.codigo_sku : 'S/SKU';
                const cant = parseInt(d.cantidad) || 1;
                const precio = parseFloat(d.precio_unitario) || 0;
                const subtotal = cant * precio;

                totalUnidades += cant;

                const keyProd = `${prodNombre} - [${prodVariante}]`;
                if (!productosMap.has(keyProd)) {
                    productosMap.set(keyProd, {
                        sku,
                        nombre: prodNombre,
                        variante: prodVariante,
                        cantidad: 0,
                        total: 0
                    });
                }
                const pInfo = productosMap.get(keyProd);
                pInfo.cantidad += cant;
                pInfo.total += subtotal;

                listaItemsDetalle.push({
                    numero_orden: o.numero_orden,
                    fecha: fechaStr,
                    vendedor: vendedor,
                    sku: sku,
                    nombre: prodNombre,
                    variante: prodVariante,
                    cantidad: cant,
                    precio_unitario: precio,
                    subtotal: subtotal
                });
            });
        }
    });

    const totalOrdenes = ordenes.length;
    const ticketPromedio = totalOrdenes > 0 ? (totalFacturado / totalOrdenes) : 0;

    // Convertir y ordenar productos por cantidad vendida descendente
    const topProductos = Array.from(productosMap.values()).sort((a, b) => b.cantidad - a.cantidad);

    // ==========================================
    // HOJA 1: 📊 DASHBOARD Y RESUMEN EJECUTIVO
    // ==========================================
    const wsDashboard = workbook.addWorksheet('📊 Dashboard y Resumen', {
        views: [{ showGridLines: true }]
    });

    // Ancho de columnas para el Dashboard
    wsDashboard.columns = [
        { width: 4 },  // A
        { width: 32 }, // B: Titulos / Items
        { width: 16 }, // C: Variantes / Metricas
        { width: 16 }, // D: Cantidad / Ordenes
        { width: 20 }, // E: Total Facturado / $
        { width: 18 }, // F: % Participacion / Promedio
        { width: 22 }, // G: Barra Visual
        { width: 4 }   // H
    ];

    // Banner Superior
    wsDashboard.mergeCells('B2:G2');
    const headerTitle = wsDashboard.getCell('B2');
    headerTitle.value = `INFORME EJECUTIVO DE VENTAS - ${marcaNombre}`;
    headerTitle.font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
    headerTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    headerTitle.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorPrimarioHex }
    };
    wsDashboard.getRow(2).height = 32;

    // Subtítulo con período
    wsDashboard.mergeCells('B3:G3');
    const subTitle = wsDashboard.getCell('B3');
    const fechaHoraGenerado = `${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} ${new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
    subTitle.value = `Período analizado: ${desde || 'Inicio'} al ${hasta || 'Hoy'}  |  Generado: ${fechaHoraGenerado} (GMT-3)`;
    subTitle.font = { italic: true, size: 10, color: { argb: 'FFFFFF' } };
    subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    subTitle.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorSecundarioHex }
    };
    wsDashboard.getRow(3).height = 20;

    // TARJETAS KPI (Filas 5 a 6)
    const kpis = [
        { colInicio: 'B', colFin: 'B', label: 'FACTURACIÓN TOTAL', valor: totalFacturado, formato: '$#,##0.00' },
        { colInicio: 'C', colFin: 'C', label: 'CANTIDAD ÓRDENES', valor: totalOrdenes, formato: '#,##0' },
        { colInicio: 'D', colFin: 'D', label: 'TICKET PROMEDIO', valor: ticketPromedio, formato: '$#,##0.00' },
        { colInicio: 'E', colFin: 'E', label: 'TOTAL UNIDADES', valor: totalUnidades, formato: '#,##0' },
        { colInicio: 'F', colFin: 'G', label: 'RECAUDACIÓN ENVÍOS', valor: totalEnvios, formato: '$#,##0.00' }
    ];

    kpis.forEach(kpi => {
        const celdaLabel = wsDashboard.getCell(`${kpi.colInicio}5`);
        if (kpi.colInicio !== kpi.colFin) {
            wsDashboard.mergeCells(`${kpi.colInicio}5:${kpi.colFin}5`);
            wsDashboard.mergeCells(`${kpi.colInicio}6:${kpi.colFin}6`);
        }
        celdaLabel.value = kpi.label;
        celdaLabel.font = { size: 9, bold: true, color: { argb: '64748B' } };
        celdaLabel.alignment = { horizontal: 'center', vertical: 'middle' };
        celdaLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };

        const celdaValor = wsDashboard.getCell(`${kpi.colInicio}6`);
        celdaValor.value = kpi.valor;
        celdaValor.font = { size: 14, bold: true, color: { argb: colorPrimarioHex } };
        celdaValor.alignment = { horizontal: 'center', vertical: 'middle' };
        celdaValor.numFmt = kpi.formato;
        celdaValor.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondoClaroHex } };
    });
    wsDashboard.getRow(5).height = 18;
    wsDashboard.getRow(6).height = 26;

    // SECCIÓN: TOP 10 PRODUCTOS MÁS VENDIDOS
    let curRow = 8;
    wsDashboard.mergeCells(`B${curRow}:G${curRow}`);
    const secTopProd = wsDashboard.getCell(`B${curRow}`);
    secTopProd.value = '🏆 TOP 10 PRODUCTOS MÁS VENDIDOS';
    secTopProd.font = { bold: true, size: 11, color: { argb: 'FFFFFF' } };
    secTopProd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSecundarioHex } };
    secTopProd.alignment = { vertical: 'middle', indent: 1 };
    wsDashboard.getRow(curRow).height = 22;
    curRow++;

    // Encabezados Top Productos
    const headersTopProd = ['Producto', 'Variante', 'Unidades Vendidas', 'Total Facturado ($)', '% del Total', 'Participación Visual'];
    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((col, idx) => {
        const c = wsDashboard.getCell(`${col}${curRow}`);
        c.value = headersTopProd[idx];
        c.font = { bold: true, size: 10, color: { argb: '334155' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        c.alignment = { horizontal: idx >= 2 ? 'center' : 'left', vertical: 'middle' };
        c.border = { bottom: { style: 'medium', color: { argb: '94A3B8' } } };
    });
    wsDashboard.getRow(curRow).height = 20;
    curRow++;

    const maxUnits = topProductos.length > 0 ? topProductos[0].cantidad : 1;
    const top10 = topProductos.slice(0, 10);

    if (top10.length === 0) {
        wsDashboard.mergeCells(`B${curRow}:G${curRow}`);
        const cEmpty = wsDashboard.getCell(`B${curRow}`);
        cEmpty.value = 'No se registraron productos en las órdenes del período seleccionado.';
        cEmpty.font = { italic: true, size: 10, color: { argb: '94A3B8' } };
        cEmpty.alignment = { horizontal: 'center' };
        curRow++;
    } else {
        top10.forEach((p, index) => {
            const pct = totalUnidades > 0 ? (p.cantidad / totalUnidades) : 0;
            const barLen = Math.round((p.cantidad / maxUnits) * 12);
            const progressBar = '█'.repeat(barLen) + '░'.repeat(12 - barLen);

            const r = wsDashboard.getRow(curRow);
            r.getCell(2).value = `${index + 1}. ${p.nombre}`;
            r.getCell(3).value = p.variante || '-';
            r.getCell(4).value = p.cantidad;
            r.getCell(4).numFmt = '#,##0';
            r.getCell(5).value = p.total;
            r.getCell(5).numFmt = '$#,##0.00';
            r.getCell(6).value = pct;
            r.getCell(6).numFmt = '0.0%';
            r.getCell(7).value = progressBar;
            r.getCell(7).font = { color: { argb: colorPrimarioHex }, bold: true, size: 9 };

            r.getCell(2).alignment = { vertical: 'middle' };
            r.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
            r.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
            r.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
            r.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
            r.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };

            // Zebra striping
            const bgHex = index % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
            for (let c = 2; c <= 7; c++) {
                r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
                r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
            }
            r.height = 20;
            curRow++;
        });
    }

    curRow += 2; // Espacio

    // SECCIÓN: DESGLOSE POR MÉTODO DE PAGO Y RENDIMIENTO POR VENDEDOR
    wsDashboard.mergeCells(`B${curRow}:D${curRow}`);
    const secPago = wsDashboard.getCell(`B${curRow}`);
    secPago.value = '💳 VENTAS POR MÉTODO DE PAGO';
    secPago.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    secPago.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSecundarioHex } };
    secPago.alignment = { vertical: 'middle', indent: 1 };

    wsDashboard.mergeCells(`E${curRow}:G${curRow}`);
    const secVend = wsDashboard.getCell(`E${curRow}`);
    secVend.value = '👤 RENDIMIENTO POR VENDEDOR';
    secVend.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    secVend.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSecundarioHex } };
    secVend.alignment = { vertical: 'middle', indent: 1 };
    wsDashboard.getRow(curRow).height = 20;
    curRow++;

    // Encabezados columnas paralelas
    wsDashboard.getCell(`B${curRow}`).value = 'Método de Pago';
    wsDashboard.getCell(`C${curRow}`).value = 'Órdenes';
    wsDashboard.getCell(`D${curRow}`).value = 'Total ($)';
    wsDashboard.getCell(`E${curRow}`).value = 'Vendedor';
    wsDashboard.getCell(`F${curRow}`).value = 'Órdenes';
    wsDashboard.getCell(`G${curRow}`).value = 'Total ($)';

    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((col, idx) => {
        const c = wsDashboard.getCell(`${col}${curRow}`);
        c.font = { bold: true, size: 9, color: { argb: '334155' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        c.alignment = { horizontal: (idx === 0 || idx === 3) ? 'left' : 'center', vertical: 'middle' };
        c.border = { bottom: { style: 'medium', color: { argb: '94A3B8' } } };
    });
    curRow++;

    const arrPagos = Array.from(pagosMap.entries()).sort((a, b) => b[1].total - a[1].total);
    const arrVend = Array.from(vendedoresMap.entries()).sort((a, b) => b[1].total - a[1].total);
    const maxRowsParallel = Math.max(arrPagos.length, arrVend.length, 1);

    for (let i = 0; i < maxRowsParallel; i++) {
        const r = wsDashboard.getRow(curRow);
        const bgHex = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

        if (i < arrPagos.length) {
            const [metodo, dataP] = arrPagos[i];
            r.getCell(2).value = metodo;
            r.getCell(3).value = dataP.cantidad;
            r.getCell(3).numFmt = '#,##0';
            r.getCell(4).value = dataP.total;
            r.getCell(4).numFmt = '$#,##0.00';
            r.getCell(3).alignment = { horizontal: 'center' };
            r.getCell(4).alignment = { horizontal: 'right' };
        }

        if (i < arrVend.length) {
            const [vend, dataV] = arrVend[i];
            r.getCell(5).value = vend;
            r.getCell(6).value = dataV.cantidad;
            r.getCell(6).numFmt = '#,##0';
            r.getCell(7).value = dataV.total;
            r.getCell(7).numFmt = '$#,##0.00';
            r.getCell(6).alignment = { horizontal: 'center' };
            r.getCell(7).alignment = { horizontal: 'right' };
        }

        for (let c = 2; c <= 7; c++) {
            r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
            r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
        }
        r.height = 19;
        curRow++;
    }

    curRow += 2;

    // SECCIÓN: LOGÍSTICA / MODO DE ENTREGA Y EVOLUCIÓN DIARIA
    wsDashboard.mergeCells(`B${curRow}:D${curRow}`);
    const secLog = wsDashboard.getCell(`B${curRow}`);
    secLog.value = '🛵 MODOS DE ENTREGA Y LOGÍSTICA';
    secLog.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    secLog.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSecundarioHex } };
    secLog.alignment = { vertical: 'middle', indent: 1 };

    wsDashboard.mergeCells(`E${curRow}:G${curRow}`);
    const secEvol = wsDashboard.getCell(`E${curRow}`);
    secEvol.value = '📅 EVOLUCIÓN DIARIA';
    secEvol.font = { bold: true, size: 10, color: { argb: 'FFFFFF' } };
    secEvol.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorSecundarioHex } };
    secEvol.alignment = { vertical: 'middle', indent: 1 };
    wsDashboard.getRow(curRow).height = 20;
    curRow++;

    wsDashboard.getCell(`B${curRow}`).value = 'Modo de Entrega';
    wsDashboard.getCell(`C${curRow}`).value = 'Órdenes';
    wsDashboard.getCell(`D${curRow}`).value = 'Total Facturado ($)';
    wsDashboard.getCell(`E${curRow}`).value = 'Fecha';
    wsDashboard.getCell(`F${curRow}`).value = 'Órdenes';
    wsDashboard.getCell(`G${curRow}`).value = 'Total Facturado ($)';

    ['B', 'C', 'D', 'E', 'F', 'G'].forEach((col, idx) => {
        const c = wsDashboard.getCell(`${col}${curRow}`);
        c.font = { bold: true, size: 9, color: { argb: '334155' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        c.alignment = { horizontal: (idx === 0 || idx === 3) ? 'left' : 'center', vertical: 'middle' };
        c.border = { bottom: { style: 'medium', color: { argb: '94A3B8' } } };
    });
    curRow++;

    const arrDias = Array.from(diasMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const arrEntregas = [
        { modo: '🛍️ Retiro en Local', cant: entregasMap['Retiro'].cantidad, total: entregasMap['Retiro'].total },
        { modo: '🛵 Envío a Domicilio', cant: entregasMap['Envio'].cantidad, total: entregasMap['Envio'].total }
    ];

    const maxRowsLog = Math.max(arrEntregas.length, arrDias.length, 1);
    for (let i = 0; i < maxRowsLog; i++) {
        const r = wsDashboard.getRow(curRow);
        const bgHex = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

        if (i < arrEntregas.length) {
            const itemE = arrEntregas[i];
            r.getCell(2).value = itemE.modo;
            r.getCell(3).value = itemE.cant;
            r.getCell(3).numFmt = '#,##0';
            r.getCell(4).value = itemE.total;
            r.getCell(4).numFmt = '$#,##0.00';
            r.getCell(3).alignment = { horizontal: 'center' };
            r.getCell(4).alignment = { horizontal: 'right' };
        }

        if (i < arrDias.length) {
            const [fechaD, dataD] = arrDias[i];
            r.getCell(5).value = fechaD;
            r.getCell(6).value = dataD.cantidad;
            r.getCell(6).numFmt = '#,##0';
            r.getCell(7).value = dataD.total;
            r.getCell(7).numFmt = '$#,##0.00';
            r.getCell(5).alignment = { horizontal: 'center' };
            r.getCell(6).alignment = { horizontal: 'center' };
            r.getCell(7).alignment = { horizontal: 'right' };
        }

        for (let c = 2; c <= 7; c++) {
            r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
            r.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
        }
        r.height = 19;
        curRow++;
    }

    // ==========================================
    // HOJA 2: 📦 DETALLE DE ÓRDENES
    // ==========================================
    const wsOrdenes = workbook.addWorksheet('📦 Detalle de Órdenes', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    wsOrdenes.columns = [
        { header: 'N° Orden', key: 'numero_orden', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Vendedor', key: 'vendedor', width: 16 },
        { header: 'Cliente', key: 'cliente_nombre', width: 22 },
        { header: 'Teléfono', key: 'cliente_telefono', width: 15 },
        { header: 'Método Pago', key: 'metodo_pago', width: 16 },
        { header: 'Modo Entrega', key: 'modo_entrega', width: 16 },
        { header: 'Cadete / Empresa', key: 'cadete', width: 18 },
        { header: 'Dirección Envío', key: 'direccion_envio', width: 25 },
        { header: 'Costo Envío ($)', key: 'costo_envio', width: 16 },
        { header: 'Estado', key: 'estado', width: 14 },
        { header: 'Total ($)', key: 'total', width: 16 },
        { header: 'Observaciones', key: 'observaciones', width: 30 }
    ];

    wsOrdenes.getRow(1).height = 26;
    wsOrdenes.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    wsOrdenes.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorPrimarioHex }
    };
    wsOrdenes.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    ordenes.forEach((o, index) => {
        const fechaStr = o.fecha ? o.fecha.split('T')[0] : '';
        const row = wsOrdenes.addRow({
            numero_orden: o.numero_orden,
            fecha: fechaStr,
            vendedor: o.vendedor || '',
            cliente_nombre: o.cliente_nombre || '',
            cliente_telefono: o.cliente_telefono || '',
            metodo_pago: o.metodo_pago || 'Sin especificar',
            modo_entrega: o.modo_entrega || 'Retiro',
            cadete: o.cadete || '',
            direccion_envio: o.direccion_envio || '',
            costo_envio: parseFloat(o.costo_envio) || 0,
            estado: o.estado || 'Iniciado',
            total: parseFloat(o.total) || 0,
            observaciones: (o.observaciones || '').replace(/\s*\[PAGO_ENVIO:[^\]]+\]\s*/g, '').trim()
        });

        row.getCell('costo_envio').numFmt = '$#,##0.00';
        row.getCell('total').numFmt = '$#,##0.00';
        row.getCell('numero_orden').font = { bold: true };
        row.getCell('total').font = { bold: true };

        const bgHex = index % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
            cell.alignment = { vertical: 'middle' };
        });

        row.getCell('fecha').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('numero_orden').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('estado').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('costo_envio').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('total').alignment = { horizontal: 'right', vertical: 'middle' };
        row.height = 20;
    });

    // Fila Totalizadora
    if (ordenes.length > 0) {
        const totalRowIdx = ordenes.length + 2;
        const totalRow = wsOrdenes.addRow({
            numero_orden: 'TOTALES',
            costo_envio: { formula: `SUM(J2:J${totalRowIdx - 1})` },
            total: { formula: `SUM(L2:L${totalRowIdx - 1})` }
        });
        totalRow.font = { bold: true, size: 10 };
        totalRow.getCell('numero_orden').alignment = { horizontal: 'center' };
        totalRow.getCell('costo_envio').numFmt = '$#,##0.00';
        totalRow.getCell('total').numFmt = '$#,##0.00';
        totalRow.eachCell({ includeEmpty: true }, cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondoClaroHex } };
            cell.border = { top: { style: 'medium', color: { argb: colorPrimarioHex } }, bottom: { style: 'double', color: { argb: colorPrimarioHex } } };
        });
        totalRow.height = 24;
    }

    // ==========================================
    // HOJA 3: 🛍️ PRODUCTOS VENDIDOS
    // ==========================================
    const wsItems = workbook.addWorksheet('🛍️ Productos Vendidos', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    wsItems.columns = [
        { header: 'N° Orden', key: 'numero_orden', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Vendedor', key: 'vendedor', width: 16 },
        { header: 'Código SKU', key: 'sku', width: 16 },
        { header: 'Producto', key: 'nombre', width: 30 },
        { header: 'Variante', key: 'variante', width: 18 },
        { header: 'Cantidad', key: 'cantidad', width: 12 },
        { header: 'Precio Unitario ($)', key: 'precio_unitario', width: 18 },
        { header: 'Subtotal ($)', key: 'subtotal', width: 18 }
    ];

    wsItems.getRow(1).height = 26;
    wsItems.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    wsItems.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorSecundarioHex }
    };
    wsItems.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    listaItemsDetalle.forEach((it, index) => {
        const row = wsItems.addRow(it);
        row.getCell('precio_unitario').numFmt = '$#,##0.00';
        row.getCell('subtotal').numFmt = '$#,##0.00';
        row.getCell('cantidad').numFmt = '#,##0';

        const bgHex = index % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
            cell.alignment = { vertical: 'middle' };
        });

        row.getCell('numero_orden').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('fecha').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('cantidad').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('precio_unitario').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('subtotal').alignment = { horizontal: 'right', vertical: 'middle' };
        row.height = 19;
    });

    if (listaItemsDetalle.length > 0) {
        const totalItemsRowIdx = listaItemsDetalle.length + 2;
        const totalItemsRow = wsItems.addRow({
            numero_orden: 'TOTALES',
            cantidad: { formula: `SUM(G2:G${totalItemsRowIdx - 1})` },
            subtotal: { formula: `SUM(I2:I${totalItemsRowIdx - 1})` }
        });
        totalItemsRow.font = { bold: true, size: 10 };
        totalItemsRow.getCell('numero_orden').alignment = { horizontal: 'center' };
        totalItemsRow.getCell('cantidad').numFmt = '#,##0';
        totalItemsRow.getCell('subtotal').numFmt = '$#,##0.00';
        totalItemsRow.eachCell({ includeEmpty: true }, cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondoClaroHex } };
            cell.border = { top: { style: 'medium', color: { argb: colorSecundarioHex } }, bottom: { style: 'double', color: { argb: colorSecundarioHex } } };
        });
        totalItemsRow.height = 24;
    }

    // ==========================================
    // HOJA 4: 🛵 LOGÍSTICA Y ENVÍOS
    // ==========================================
    const wsEnvios = workbook.addWorksheet('🛵 Logística y Envíos', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
    });

    wsEnvios.columns = [
        { header: 'N° Orden', key: 'numero_orden', width: 14 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Cliente', key: 'cliente_nombre', width: 22 },
        { header: 'Teléfono', key: 'cliente_telefono', width: 15 },
        { header: 'Dirección Envío', key: 'direccion_envio', width: 30 },
        { header: 'Cadete', key: 'cadete', width: 18 },
        { header: 'Horario', key: 'horario_envio', width: 16 },
        { header: 'Costo Envío ($)', key: 'costo_envio', width: 16 },
        { header: 'Total Pedido ($)', key: 'total', width: 16 },
        { header: 'Método Pago', key: 'metodo_pago', width: 16 },
        { header: 'Estado', key: 'estado', width: 14 }
    ];

    wsEnvios.getRow(1).height = 26;
    wsEnvios.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    wsEnvios.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorPrimarioHex }
    };
    wsEnvios.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    listaEnvios.forEach((env, index) => {
        const row = wsEnvios.addRow(env);
        row.getCell('costo_envio').numFmt = '$#,##0.00';
        row.getCell('total').numFmt = '$#,##0.00';

        const bgHex = index % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'E2E8F0' } } };
            cell.alignment = { vertical: 'middle' };
        });

        row.getCell('numero_orden').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('fecha').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('costo_envio').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('total').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('estado').alignment = { horizontal: 'center', vertical: 'middle' };
        row.height = 20;
    });

    if (listaEnvios.length > 0) {
        const totalEnvRowIdx = listaEnvios.length + 2;
        const totalEnvRow = wsEnvios.addRow({
            numero_orden: 'TOTALES',
            costo_envio: { formula: `SUM(H2:H${totalEnvRowIdx - 1})` },
            total: { formula: `SUM(I2:I${totalEnvRowIdx - 1})` }
        });
        totalEnvRow.font = { bold: true, size: 10 };
        totalEnvRow.getCell('numero_orden').alignment = { horizontal: 'center' };
        totalEnvRow.getCell('costo_envio').numFmt = '$#,##0.00';
        totalEnvRow.getCell('total').numFmt = '$#,##0.00';
        totalEnvRow.eachCell({ includeEmpty: true }, cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorFondoClaroHex } };
            cell.border = { top: { style: 'medium', color: { argb: colorPrimarioHex } }, bottom: { style: 'double', color: { argb: colorPrimarioHex } } };
        });
        totalEnvRow.height = 24;
    }

    return workbook;
}

/**
 * Exporta el catálogo completo de productos y stock a Excel profesional
 * @param {Array} productos 
 * @param {string} marca 
 * @returns {ExcelJS.Workbook}
 */
async function exportarCatalogoStockExcel(productos = [], marca = 'panatech') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Registrador de Ventas';
    workbook.created = new Date();

    const esIncanto = marca.toLowerCase() === 'incanto';
    const marcaNombre = esIncanto ? 'INCANTO' : 'PANATECH';
    const colorPrimarioHex = esIncanto ? 'BE123C' : '0284C7'; // Rose 700 / Sky 600
    const colorFondoClaroHex = esIncanto ? 'FFF1F2' : 'F0F9FF';

    const ws = workbook.addWorksheet('Stock y Precios', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1, showGridLines: true }]
    });

    ws.columns = [
        { header: 'ID Sistema', key: 'id', width: 12 },
        { header: 'Foto (Enlace)', key: 'foto', width: 16 },
        { header: 'SKU / Código', key: 'sku', width: 18 },
        { header: 'Producto', key: 'nombre', width: 44 },
        { header: 'Variante / Color', key: 'variante', width: 22 },
        { header: 'Stock Actual', key: 'stock', width: 14 },
        { header: 'Precio Efectivo / Transf ($)', key: 'precio', width: 25 },
        { header: 'Precio Lista ($)', key: 'precio_lista', width: 18 },
        { header: 'Origen', key: 'origen', width: 14 },
        { header: 'URL Foto', key: 'imagen_url', width: 50 },
        { header: 'URL Tienda Online', key: 'url_tienda', width: 50 }
    ];

    ws.getRow(1).height = 28;
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    ws.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colorPrimarioHex }
    };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    productos.forEach((p, idx) => {
        const row = ws.addRow({
            id: p.id,
            foto: '',
            sku: p.codigo_sku || '',
            nombre: p.nombre || '',
            variante: p.variante || 'Única',
            stock: parseInt(p.stock) || 0,
            precio: parseFloat(p.precio) || 0,
            precio_lista: parseFloat(p.precio_lista) || 0,
            origen: p.synced_web ? 'Tienda Web' : 'Sistema',
            imagen_url: p.imagen_url || '',
            url_tienda: p.url_tienda || ''
        });

        const hasFoto = p.imagen_url && p.imagen_url !== '/img/no-image.svg' && !p.imagen_url.includes('no-image');
        if (hasFoto) {
            row.getCell('foto').value = {
                text: '🖼️ Ver Foto',
                hyperlink: p.imagen_url,
                tooltip: 'Clic para ver foto del producto'
            };
            row.getCell('foto').font = { color: { argb: '0000EE' }, underline: true, bold: true, size: 9 };
        } else {
            row.getCell('foto').value = 'Sin foto';
            row.getCell('foto').font = { color: { argb: '94A3B8' }, italic: true, size: 9 };
        }

        if (p.url_tienda) {
            row.getCell('url_tienda').value = {
                text: p.url_tienda,
                hyperlink: p.url_tienda,
                tooltip: 'Ver en tienda online'
            };
            row.getCell('url_tienda').font = { color: { argb: '0000EE' }, underline: true, size: 9 };
        }

        row.getCell('id').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('foto').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('sku').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('nombre').alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell('variante').alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell('stock').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('precio').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('precio_lista').alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell('origen').alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell('imagen_url').alignment = { horizontal: 'left', vertical: 'middle' };
        row.getCell('url_tienda').alignment = { horizontal: 'left', vertical: 'middle' };

        row.getCell('stock').numFmt = '#,##0';
        row.getCell('precio').numFmt = '$#,##0.00';
        row.getCell('precio_lista').numFmt = '$#,##0.00';

        if (p.stock === 0) {
            row.getCell('stock').fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE4E6' }
            };
            row.getCell('stock').font = { color: { argb: 'BE123C' }, bold: true };
        } else {
            row.getCell('stock').font = { color: { argb: '047857' }, bold: true };
        }

        row.height = 24;

        if (idx % 2 === 1) {
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                if (colNumber !== 6 || p.stock > 0) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'F8FAFC' }
                    };
                }
            });
        }
    });

    return workbook;
}

/**
 * Procesa la importación de un archivo Excel de productos y stock
 * @param {Buffer} buffer 
 * @param {string} marca 
 * @param {object} supabase 
 */
async function procesarImportacionStockExcel(buffer, marca, supabase) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.getWorksheet('Stock y Precios') || workbook.worksheets[0];
    if (!ws) {
        throw new Error('El archivo Excel no contiene hojas de datos válidas.');
    }

    let headerRowIdx = 1;
    let colMap = {};

    for (let r = 1; r <= 5; r++) {
        const row = ws.getRow(r);
        const tempMap = {};
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const raw = cell.value && typeof cell.value === 'object' ? (cell.value.text || '') : cell.value;
            const val = String(raw || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            if (val === 'id' || val === 'id sistema') tempMap.id = colNumber;
            else if (val.includes('sku') || val.includes('codigo')) tempMap.sku = colNumber;
            else if (val.includes('producto') || val.includes('nombre') || val.includes('articulo') || val.includes('descripcion')) tempMap.nombre = colNumber;
            else if (val.includes('variante') || val.includes('color')) tempMap.variante = colNumber;
            else if (val.includes('stock') || val.includes('cantidad') || val.includes('unidades')) tempMap.stock = colNumber;
            else if ((val.includes('precio') && !val.includes('lista')) || val.includes('efectivo')) tempMap.precio = colNumber;
            else if (val.includes('precio') && val.includes('lista')) tempMap.precio_lista = colNumber;
            else if (val.includes('url foto') || val.includes('imagen') || val.includes('foto')) tempMap.imagen_url = colNumber;
        });

        if (tempMap.nombre || tempMap.sku || tempMap.id) {
            headerRowIdx = r;
            colMap = tempMap;
            break;
        }
    }

    if (!colMap.nombre && !colMap.sku && !colMap.id) {
        throw new Error('No se detectaron columnas válidas (Producto, SKU, ID o Stock) en el encabezado del archivo.');
    }

    const marcaTarget = (marca || 'panatech').toLowerCase();
    const { data: dbProducts, error: dbErr } = await supabase
        .from('productos')
        .select('*')
        .eq('marca', marcaTarget);

    if (dbErr) throw dbErr;

    const metadata = await obtenerMetadataMarca(supabase, marcaTarget);

    const mapById = new Map();
    const mapBySku = new Map();
    const mapByNameVar = new Map();

    (dbProducts || []).forEach(p => {
        mapById.set(Number(p.id), p);
        if (p.codigo_sku) mapBySku.set(String(p.codigo_sku).trim().toUpperCase(), p);
        const key = `${normalizeName(p.nombre || '')}|${normalizeName(p.variante || 'única')}`;
        mapByNameVar.set(key, p);
    });

    let actualizados = 0;
    let creados = 0;
    let errores = 0;
    let metadataCambio = false;

    const totalRows = ws.rowCount;
    for (let r = headerRowIdx + 1; r <= totalRows; r++) {
        const row = ws.getRow(r);
        if (!row || !row.hasValues) continue;

        const getCellCleanValue = (colIdx) => {
            if (!colIdx) return null;
            const c = row.getCell(colIdx);
            if (!c || c.value === null || c.value === undefined) return null;
            if (typeof c.value === 'object') {
                return c.value.text || c.value.result || c.value.hyperlink || '';
            }
            return c.value;
        };

        const rawId = getCellCleanValue(colMap.id);
        const rawSku = getCellCleanValue(colMap.sku);
        const rawNombre = getCellCleanValue(colMap.nombre);
        const rawVariante = getCellCleanValue(colMap.variante);
        const rawStock = getCellCleanValue(colMap.stock);
        const rawPrecio = getCellCleanValue(colMap.precio);
        const rawImagenUrl = getCellCleanValue(colMap.imagen_url);

        const idNum = rawId ? parseInt(rawId) : null;
        const skuStr = rawSku ? String(rawSku).trim() : '';
        const nombreStr = rawNombre ? String(rawNombre).trim() : '';
        const varianteStr = rawVariante ? String(rawVariante).trim() : '';
        const stockNum = rawStock !== null && rawStock !== '' ? parseInt(rawStock) : null;
        const precioNum = rawPrecio !== null && rawPrecio !== '' ? parseFloat(rawPrecio) : null;
        const imagenUrlStr = rawImagenUrl ? String(rawImagenUrl).trim() : '';

        if (!idNum && !skuStr && !nombreStr) continue;

        let matched = null;
        if (idNum && mapById.has(idNum)) {
            matched = mapById.get(idNum);
        } else if (skuStr && mapBySku.has(skuStr.toUpperCase())) {
            matched = mapBySku.get(skuStr.toUpperCase());
        } else if (nombreStr) {
            const key = `${normalizeName(nombreStr)}|${normalizeName(varianteStr || 'única')}`;
            if (mapByNameVar.has(key)) {
                matched = mapByNameVar.get(key);
            }
        }

        if (matched) {
            const updateFields = {};
            if (stockNum !== null && !isNaN(stockNum) && stockNum >= 0) {
                updateFields.stock = stockNum;
                matched.stock = stockNum;
            }
            if (precioNum !== null && !isNaN(precioNum) && precioNum >= 0) {
                updateFields.precio = precioNum;
                matched.precio = precioNum;
            }
            if (nombreStr && nombreStr !== matched.nombre) {
                updateFields.nombre = nombreStr;
                matched.nombre = nombreStr;
            }
            if (varianteStr && varianteStr !== matched.variante) {
                updateFields.variante = varianteStr;
                matched.variante = varianteStr;
            }

            if (Object.keys(updateFields).length > 0) {
                const { error: updErr } = await supabase
                    .from('productos')
                    .update(updateFields)
                    .eq('id', matched.id);

                if (!updErr) {
                    actualizados++;
                } else {
                    errores++;
                }
            }

            if (imagenUrlStr && imagenUrlStr !== '/img/no-image.svg' && !imagenUrlStr.includes('no-image')) {
                if (!metadata[matched.id]) metadata[matched.id] = {};
                metadata[matched.id].imagen_url = imagenUrlStr;
                metadata[matched.id].ultima_modificacion = new Date().toISOString();
                metadataCambio = true;
            }
        } else if (nombreStr) {
            const nuevoSku = skuStr || `MAN-${Date.now().toString().slice(-6)}${r}`;
            const nuevoProd = {
                marca: marcaTarget,
                codigo_sku: nuevoSku,
                nombre: nombreStr,
                variante: varianteStr || 'Única',
                stock: stockNum !== null && !isNaN(stockNum) && stockNum >= 0 ? stockNum : 0,
                precio: precioNum !== null && !isNaN(precioNum) && precioNum >= 0 ? precioNum : 0
            };

            const { data: insData, error: insErr } = await supabase
                .from('productos')
                .insert([nuevoProd])
                .select()
                .single();

            if (!insErr && insData) {
                creados++;
                mapById.set(Number(insData.id), insData);
                if (imagenUrlStr) {
                    metadata[insData.id] = {
                        imagen_url: imagenUrlStr,
                        variante: insData.variante,
                        ultima_modificacion: new Date().toISOString()
                    };
                    metadataCambio = true;
                }
            } else {
                errores++;
            }
        }
    }

    if (metadataCambio) {
        await guardarMetadataMarca(supabase, metadata, marcaTarget);
    }

    return {
        success: true,
        actualizados,
        creados,
        errores,
        totalProcesados: actualizados + creados
    };
}

module.exports = {
    generarReporteVentasAvanzado,
    exportarCatalogoStockExcel,
    procesarImportacionStockExcel
};
