// "06/24/26" -> "2026-06-24" for lexicographic date comparison
export function csvDateToISO(csvDate) {
  const [mm, dd, yy] = csvDate.split('/');
  return `20${yy}-${mm}-${dd}`;
}

export function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function mmddyy(date) {
  const mm = date.getMonth() + 1;
  const dd = date.getDate();
  return [
    (mm > 9 ? "" : "0") + mm,
    (dd > 9 ? "" : "0") + dd,
    date.getFullYear(),
  ].join("/");
}

export function transformCSV(data) {
  return data.map(function (row) {
    const timestamp = new Date(row["Transaction Post Date"]);
    const txRef = row["Reference Number"];
    const txDesc = row["Description of Transaction"];
    const txType = row["Transaction Type"];
    const txAmount = -parseFloat(row["Amount"]);

    return {
      Date: mmddyy(timestamp),
      Description: txDesc,
      "Original Description": txDesc,
      Amount: txAmount,
      "Transaction Type": txAmount > 0 ? "credit" : "debit",
      Category: (txType === 'payment_transaction'
        ? 'Transfer:Credit Card Payment'
        : 'Uncategorized'
      ),
      Reference: txRef,
      Tags: "",
      Memo: "",
    };
  });
}

export function filterNewTransactions(data, lastImport) {
  if (!lastImport) return data;
  return data.filter((row) => {
    const rowDate = csvDateToISO(row["Transaction Post Date"]);
    if (rowDate > lastImport.date) return true;
    if (rowDate === lastImport.date) {
      return !lastImport.refNumbers.includes(row["Reference Number"]);
    }
    return false;
  });
}

export function computeNewLastImport(allData, existing) {
  const latestDate = allData.reduce((best, row) => {
    const d = csvDateToISO(row["Transaction Post Date"]);
    return d > best ? d : best;
  }, existing?.date ?? '');

  if (!latestDate) return existing;

  const latestRefs = allData
    .filter((row) => csvDateToISO(row["Transaction Post Date"]) === latestDate)
    .map((row) => row["Reference Number"]);

  if (existing?.date === latestDate) {
    return {
      date: latestDate,
      refNumbers: [...new Set([...existing.refNumbers, ...latestRefs])],
    };
  }

  return { date: latestDate, refNumbers: latestRefs };
}
