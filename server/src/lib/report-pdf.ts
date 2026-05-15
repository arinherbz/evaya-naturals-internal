type PaymentTotals = {
  cash: number;
  mtnMobileMoney: number;
  airtelMoney: number;
  card: number;
  bankTransfer: number;
};

type ShiftSummary = {
  cashierName: string;
  status: string;
  salesTotal: number;
  expectedCash?: number | null;
  countedCash?: number | null;
  variance?: number | null;
};

type ProductSummary = {
  productName: string;
  quantity: number;
  revenue: number;
};

type StockSummary = {
  productId?: string;
  productName: string;
  quantity: number;
};

type ReportPdfData = {
  businessName: string;
  title: string;
  periodLabel: string;
  generatedAt: string;
  totalSales: number;
  salesCount: number;
  totalDiscounts: number;
  expensesTotal: number;
  netAmount: number;
  paymentTotals: PaymentTotals;
  bestSellingProducts: ProductSummary[];
  lowStockItems: StockSummary[];
  shifts: ShiftSummary[];
  footerMessage?: string;
};

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatMoney(value: number) {
  return `UGX ${Math.round(value).toLocaleString('en-US')}`;
}

function buildPdf(lines: string[]) {
  const content = lines.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(content, 'utf8')} >> stream\n${content}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    '6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export function generateReportPdf(data: ReportPdfData) {
  const topProducts = data.bestSellingProducts.slice(0, 5);
  const lowStockItems = data.lowStockItems.slice(0, 5);
  const shifts = data.shifts.slice(0, 5);

  const commands = [
    '0.16 0.45 0.25 rg 48 736 42 42 re f',
    'BT /F2 22 Tf 1 1 1 rg 62 751 Td (E) Tj ET',
    `BT /F2 22 Tf 0.12 0.16 0.14 rg 102 754 Td (${escapePdfText(data.businessName)}) Tj ET`,
    'BT /F1 10 Tf 0.4 0.45 0.42 rg 102 740 Td (Internal report) Tj ET',
  ];

  let y = 705;
  const pushLine = (text: string, bold = false) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${bold ? 12 : 10} Tf 0.12 0.16 0.14 rg 48 ${y} Td (${escapePdfText(text)}) Tj ET`);
    y -= bold ? 18 : 14;
  };

  pushLine(data.title, true);
  pushLine(`Date range: ${data.periodLabel}`);
  pushLine(`Generated: ${data.generatedAt}`);
  y -= 6;
  pushLine(`Total sales: ${formatMoney(data.totalSales)}`, true);
  pushLine(`Number of sales: ${data.salesCount}`);
  pushLine(`Total discounts: ${formatMoney(data.totalDiscounts)}`);
  pushLine(`Expenses total: ${formatMoney(data.expensesTotal)}`);
  pushLine(`Net amount after expenses: ${formatMoney(data.netAmount)}`);
  y -= 6;
  pushLine('Payment methods', true);
  pushLine(`Cash: ${formatMoney(data.paymentTotals.cash)}`);
  pushLine(`MTN Mobile Money: ${formatMoney(data.paymentTotals.mtnMobileMoney)}`);
  pushLine(`Airtel Money: ${formatMoney(data.paymentTotals.airtelMoney)}`);
  pushLine(`Bank Card: ${formatMoney(data.paymentTotals.card)}`);
  pushLine(`Bank Transfer: ${formatMoney(data.paymentTotals.bankTransfer)}`);
  y -= 6;
  pushLine('Best-selling products', true);
  if (topProducts.length === 0) {
    pushLine('No product sales in this period.');
  } else {
    topProducts.forEach((item) => pushLine(`${item.productName}: ${item.quantity} units · ${formatMoney(item.revenue)}`));
  }
  y -= 6;
  pushLine('Low stock summary', true);
  if (lowStockItems.length === 0) {
    pushLine('No low stock items right now.');
  } else {
    lowStockItems.forEach((item) => pushLine(`${item.productName}: ${item.quantity} left`));
  }
  y -= 6;
  pushLine('Shift cash-up summary', true);
  if (shifts.length === 0) {
    pushLine('No shifts in this period.');
  } else {
    shifts.forEach((shift) => pushLine(
      `${shift.cashierName}: ${formatMoney(shift.salesTotal)} · expected ${formatMoney(shift.expectedCash ?? 0)} · counted ${formatMoney(shift.countedCash ?? 0)} · variance ${formatMoney(shift.variance ?? 0)} · ${shift.status}`
    ));
  }
  if (data.footerMessage) {
    y -= 8;
    pushLine(data.footerMessage);
  }

  return buildPdf(commands);
}
