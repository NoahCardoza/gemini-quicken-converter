import { useState } from "react";
import {ReactComponent as UploadIcon} from "../assets/upload.svg";
import Papa from "papaparse";

const STORAGE_KEY = 'gemini-last-import';

function loadLastImport() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveLastImport(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// "06/24/26" -> "2026-06-24" for lexicographic date comparison
function csvDateToISO(csvDate) {
  const [mm, dd, yy] = csvDate.split('/');
  return `20${yy}-${mm}-${dd}`;
}

function formatDisplayDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function downloadTextAsCSV(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 100);
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

function transformCSV(data) {
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

function filterNewTransactions(data, lastImport) {
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

function computeNewLastImport(allData, existing) {
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

function IndexPage() {
  const [lastImport, setLastImport] = useState(() => loadLastImport());
  const [status, setStatus] = useState(null);

  function handleFiles(files) {
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      const parts = file.name.split(".");
      const ext = parts.pop();

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          const allData = results.data;
          const current = loadLastImport();
          const newData = filterNewTransactions(allData, current);
          const nextImport = computeNewLastImport(allData, current);

          if (nextImport) {
            saveLastImport(nextImport);
            setLastImport(nextImport);
          }

          setStatus({ shown: newData.length, filtered: allData.length - newData.length });

          if (newData.length > 0) {
            downloadTextAsCSV(
              [...parts, "quicken", ext].join("."),
              Papa.unparse(transformCSV(newData), {
                header: true,
                columns: [
                  "Date",
                  "Description",
                  "Original Description",
                  "Amount",
                  "Transaction Type",
                  "Category",
                  "Reference",
                  "Tags",
                  "Memo",
                ],
              })
            );
          }
        },
      });
    });
  }

  function handleClear() {
    localStorage.removeItem(STORAGE_KEY);
    setLastImport(null);
    setStatus(null);
  }

  return (
    <div className="flex items-center w-full h-full flex-col p-5">
      <div className="mb-8 text-xl">
        Convert your Gemini Credit Card CSV export to a Quicken ready CSV!
      </div>
      <div className="px-6 sm:px-0 sm:w-8/12 md:w-7/12 lg:w-6/12 xl:w-4/12">
        <div className="relative group w-full h-64 flex justify-center items-center">
          <div
            className="absolute inset-0 w-full h-full rounded-xl bg-gray-700 bg-opacity-80 shadow-2xl backdrop-blur-xl group-hover:bg-opacity-70 group-hover:scale-110 transition duration-300" />
          <input
            accept=".csv"
            className="relative z-10 opacity-0 h-full w-full cursor-pointer"
            type="file"
            multiple
            name="input"
            id="dragOver"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div
            className="absolute top-0 right-0 bottom-0 left-0 w-full h-full m-auto flex items-center justify-center">
            <div className="space-y-6 text-center">
              <UploadIcon className="m-auto fill-blue-300" width="32" height="32" />
              <p className="text-gray-100 text-lg">
                Drag and drop a file or <label
                  htmlFor="dragOver"
                  title="Upload a file"
                  className="relative z-20 cursor-pointer block link"
                  >Upload a file</label>
              </p>
            </div>
          </div>
        </div>

        {status && (
          <div className={`mt-4 text-center text-sm ${status.shown > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {status.shown > 0
              ? `Downloaded ${status.shown} new transaction${status.shown !== 1 ? 's' : ''}${status.filtered > 0 ? ` (${status.filtered} already imported filtered out)` : ''}.`
              : `No new transactions found — ${status.filtered} already imported.`}
          </div>
        )}

        {lastImport && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
            <span>
              Last import: {formatDisplayDate(lastImport.date)} &middot; {lastImport.refNumbers.length} ref{lastImport.refNumbers.length !== 1 ? 's' : ''} tracked on that date
            </span>
            <button
              onClick={handleClear}
              className="ml-4 text-red-400 hover:text-red-300 transition"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default IndexPage
