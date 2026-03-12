"use client";

import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import React, { useEffect, useMemo, useRef, useState } from "react";

type Product = {
  item_name: string;
  price: number;
  size: string | null;
};

type BillLine = {
  id: string;
  name: string;
  size?: string | null;
  unitPrice: number;
  quantity: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function safeNumber(input: string) {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

type SupabaseConfig = { url: string; anonKey: string };

function getSupabaseClient(config?: SupabaseConfig | null) {
  const fromConfigUrl = config?.url?.trim();
  const fromConfigKey = config?.anonKey?.trim();
  if (fromConfigUrl && fromConfigKey) {
    return createClient(fromConfigUrl, fromConfigKey);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon);
}

export default function Home() {
  const [sbUrl, setSbUrl] = useState("");
  const [sbAnonKey, setSbAnonKey] = useState("");
  const [sbSaved, setSbSaved] = useState(false);

  const supabaseConfig = useMemo<SupabaseConfig | null>(() => {
    if (!sbSaved) return null;
    const url = sbUrl.trim();
    const anonKey = sbAnonKey.trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  }, [sbAnonKey, sbSaved, sbUrl]);

  const supabase = useMemo(() => getSupabaseClient(supabaseConfig), [supabaseConfig]);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);

  const [quantity, setQuantity] = useState("1");

  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  const [lines, setLines] = useState<BillLine[]>([]);
  const [factoryName, setFactoryName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const grandTotal = useMemo(
    () =>
      lines.reduce((sum, l) => sum + (l.unitPrice || 0) * (l.quantity || 0), 0),
    [lines],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    try {
      const savedUrl = window.localStorage.getItem("sb_url") || "";
      const savedKey = window.localStorage.getItem("sb_anon_key") || "";
      if (savedUrl && savedKey) {
        setSbUrl(savedUrl);
        setSbAnonKey(savedKey);
        setSbSaved(true);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    setSearchError(null);
    setSelected(null);
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const t = window.setTimeout(async () => {
      if (!supabase) {
        setSearchError(
          "Supabase is not configured yet. Add it below (or via .env.local) to enable search.",
        );
        return;
      }

      setSearching(true);
      try {
        const { data, error } = await supabase
          .from("factory_products")
          .select("item_name,price,size")
          .ilike("item_name", `%${search.trim()}%`)
          .order("item_name", { ascending: true })
          .limit(10);

        if (error) throw error;

        const rows = (data || []) as Product[];
        setResults(rows);
        if (rows.length === 0) {
          setSearchError(`No items found for "${search.trim()}"`);
          setDropdownOpen(false);
        } else {
          setSearchError(null);
          setDropdownOpen(true);
        }
      } catch (err) {
        setResults([]);
        setSearchError(
          err instanceof Error ? err.message : "Failed to search products.",
        );
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(t);
  }, [search, supabase]);

  function addSelectedToBill() {
    const q = Math.max(1, Math.floor(safeNumber(quantity)));
    if (!selected) return;
    setLines((prev) => [
      ...prev,
      {
        id: makeId(),
        name: selected.item_name,
        size: selected.size,
        unitPrice: Number(selected.price) || 0,
        quantity: q,
      },
    ]);
    setSearch("");
    setResults([]);
    setSelected(null);
    setDropdownOpen(false);
    setQuantity("1");
  }

  function addCustomToBill() {
    const name = customName.trim();
    const price = safeNumber(customPrice);
    const q = Math.max(1, Math.floor(safeNumber(quantity)));
    if (!name || price <= 0) return;

    setLines((prev) => [
      ...prev,
      {
        id: makeId(),
        name,
        unitPrice: price,
        quantity: q,
      },
    ]);
    setCustomName("");
    setCustomPrice("");
    setQuantity("1");
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function generatePdfInvoice() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const margin = 40;
    const blue = "#1d4ed8";
    const grey = "#6b7280";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(factoryName || "Customer", margin + 90, margin + 24);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#4b5563");
    const infoLines: string[] = [];
    if (customerMobile.trim()) infoLines.push(`Mobile: ${customerMobile.trim()}`);
    if (shippingAddress.trim()) infoLines.push(`Ship to: ${shippingAddress.trim()}`);
    if (infoLines.length > 0) {
      doc.text(infoLines, margin + 90, margin + 40);
    }
    doc.setTextColor("#111827");

    doc.setDrawColor(180);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, margin, 72, 48, 6, 6, "FD");
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("LOGO", margin + 24, margin + 30);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INVOICE", pageWidth - margin, margin + 24, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const today = new Date();
    const invoiceNo = `INV-${today.getFullYear()}${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-${String(
      today.getTime(),
    ).slice(-5)}`;
    doc.setTextColor(grey);
    doc.text(
      `Date: ${today.toLocaleDateString()}`,
      pageWidth - margin,
      margin + 42,
      { align: "right" },
    );
    doc.text(`Invoice No: ${invoiceNo}`, pageWidth - margin, margin + 58, {
      align: "right",
    });
    doc.setTextColor("#111827");

    let y = margin + 90;
    doc.setDrawColor(229);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    const colNameX = margin;
    const colQtyX = pageWidth - margin - 190;
    const colUnitX = pageWidth - margin - 120;
    const colTotalX = pageWidth - margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(blue);
    doc.text("Item", colNameX, y);
    doc.text("Qty", colQtyX, y, { align: "right" });
    doc.text("Unit", colUnitX, y, { align: "right" });
    doc.text("Total", colTotalX, y, { align: "right" });
    doc.setTextColor("#111827");

    y += 10;
    doc.setDrawColor(229);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const maxRows = 18;
    const rows = lines.slice(0, maxRows);
    rows.forEach((l) => {
      const rowTotal = (l.unitPrice || 0) * (l.quantity || 0);
      const displayName = l.size ? `${l.name} (${l.size})` : l.name;

      const nameLines = doc.splitTextToSize(displayName, colQtyX - colNameX - 8);
      doc.text(nameLines, colNameX, y);
      doc.text(String(l.quantity), colQtyX, y, { align: "right" });
      doc.text(formatMoney(l.unitPrice), colUnitX, y, { align: "right" });
      doc.text(formatMoney(rowTotal), colTotalX, y, { align: "right" });

      y += Math.max(18, nameLines.length * 12);
      if (y > pageHeight - 170) return;
    });

    if (lines.length > maxRows) {
      doc.setTextColor(grey);
      doc.text(
        `+ ${lines.length - maxRows} more item(s) not shown`,
        margin,
        y,
      );
      doc.setTextColor("#111827");
      y += 18;
    }

    y += 10;
    doc.setDrawColor(229);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Grand Total", pageWidth - margin - 120, y, { align: "right" });
    doc.text(formatMoney(grandTotal), pageWidth - margin, y, { align: "right" });

    const termsY = pageHeight - 130;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Terms & Conditions", margin, termsY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(grey);
    doc.text("Payment due within 15 days.", margin, termsY + 18);
    doc.text(
      "Goods once sold will not be taken back.",
      margin,
      termsY + 34,
    );
    doc.setTextColor("#111827");

    const signBoxW = 180;
    const signBoxH = 60;
    const signX = pageWidth - margin - signBoxW;
    const signY = pageHeight - 140;
    doc.setDrawColor(200);
    doc.roundedRect(signX, signY, signBoxW, signBoxH, 6, 6, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(grey);
    doc.text("Digital Signature", signX + signBoxW / 2, signY + signBoxH + 16, {
      align: "center",
    });
    doc.setTextColor("#111827");

    doc.save(`invoice_${invoiceNo}.pdf`);
  }

  const canAddSelected =
    !!selected && Math.max(1, Math.floor(safeNumber(quantity))) >= 1;
  const canAddCustom =
    customName.trim().length > 0 &&
    safeNumber(customPrice) > 0 &&
    Math.max(1, Math.floor(safeNumber(quantity))) >= 1;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Simple Billing Form
          </h1>
          <p className="text-sm text-zinc-600">
            Clean, Google-Form style billing with live totals and PDF invoice
            generation.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    The Form
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    Search your Supabase products or add a custom item.
                  </p>
                </div>
                <div className="w-full space-y-2 sm:w-64">
                  <div>
                    <label className="text-xs font-medium text-zinc-700">
                      Customer Name
                    </label>
                    <input
                      value={factoryName}
                      onChange={(e) => setFactoryName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      placeholder="Customer Name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-700">
                      Customer Mobile No
                    </label>
                    <input
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      placeholder="e.g., 9876543210"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-700">
                      Shipping Address
                    </label>
                    <textarea
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      rows={2}
                      placeholder="Street, City, PIN"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-6">
                <div className="sm:col-span-4" ref={dropdownRef}>
                  <label className="text-xs font-medium text-zinc-700">
                    Search items
                  </label>
                  <div className="relative mt-1">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onFocus={() => {
                        if (results.length) setDropdownOpen(true);
                      }}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      placeholder="Type to search"
                    />
                    <div className="pointer-events-none absolute right-3 top-2.5 text-xs text-zinc-500">
                      {searching ? "Searching..." : ""}
                    </div>
                    {dropdownOpen && results.length > 0 && (
                      <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                        {results.map((p) => (
                          <button
                            key={`${p.item_name}_${p.size ?? ""}_${p.price}`}
                            type="button"
                            onClick={() => {
                              setSelected(p);
                              setDropdownOpen(false);
                            }}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                          >
                            <span className="font-medium text-zinc-900">
                              {p.item_name}
                              {p.size ? (
                                <span className="ml-2 text-xs font-normal text-zinc-500">
                                  {p.size}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-xs text-zinc-700">
                              {formatMoney(Number(p.price) || 0)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {searchError ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {searchError}
                    </div>
                  ) : null}

                  {!supabase ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                      <div className="font-semibold">
                        Supabase setup (needed for search)
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <input
                          value={sbUrl}
                          onChange={(e) => setSbUrl(e.target.value)}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                          placeholder="Supabase URL (https://xxxx.supabase.co)"
                        />
                        <input
                          value={sbAnonKey}
                          onChange={(e) => setSbAnonKey(e.target.value)}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                          placeholder="Supabase anon/public key"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                window.localStorage.setItem("sb_url", sbUrl.trim());
                                window.localStorage.setItem(
                                  "sb_anon_key",
                                  sbAnonKey.trim(),
                                );
                                setSbSaved(true);
                              } catch {
                                setSbSaved(false);
                              }
                            }}
                            disabled={!sbUrl.trim() || !sbAnonKey.trim()}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Save & Enable Search
                          </button>
                          <div className="text-[11px] text-amber-800">
                            {sbSaved ? "Saved in this browser." : ""}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-amber-800">
                        Alternative: put these in <span className="font-mono">simplebilling/.env.local</span>{" "}
                        as <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
                        <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, then restart the dev server.
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-zinc-700">
                    Quantity
                  </label>
                  <input
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                    placeholder="1"
                  />
                </div>

                <div className="sm:col-span-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-zinc-700">
                      <span className="font-medium text-zinc-900">
                        Selected:
                      </span>{" "}
                      {selected ? (
                        <>
                          {selected.item_name}
                          {selected.size ? (
                            <span className="text-zinc-500">
                              {" "}
                              ({selected.size})
                            </span>
                          ) : null}
                          <span className="text-zinc-500">
                            {" "}
                            • {formatMoney(Number(selected.price) || 0)}
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-500">None</span>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={addSelectedToBill}
                        disabled={!canAddSelected}
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add to Bill
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Custom Entry
                    </h3>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
                  <div className="sm:col-span-3">
                    <label className="text-xs font-medium text-zinc-700">
                      Item Name
                    </label>
                    <input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      placeholder="e.g., Custom Part"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-zinc-700">
                      Price
                    </label>
                    <input
                      inputMode="decimal"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-blue-600/20 focus:ring-4"
                      placeholder="e.g., 250"
                    />
                  </div>

                  <div className="sm:col-span-1 sm:flex sm:items-end">
                    <button
                      type="button"
                      onClick={addCustomToBill}
                      disabled={!canAddCustom}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    The Live List
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    Items you’ve added to this bill.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-zinc-500">
                    Live Grand Total
                  </div>
                  <div className="text-lg font-semibold text-zinc-900">
                    {formatMoney(grandTotal)}
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Unit</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white">
                    {lines.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-10 text-center text-sm text-zinc-500"
                        >
                          No items yet. Add an item above to start your bill.
                        </td>
                      </tr>
                    ) : (
                      lines.map((l) => {
                        const rowTotal = (l.unitPrice || 0) * (l.quantity || 0);
                        return (
                          <tr key={l.id} className="hover:bg-zinc-50/50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-zinc-900">
                                {l.name}
                              </div>
                              {l.size ? (
                                <div className="text-xs text-zinc-500">
                                  Size: {l.size}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {l.quantity}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoney(l.unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-zinc-900">
                              {formatMoney(rowTotal)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeLine(l.id)}
                                className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-zinc-500">
                  Tip: Add your logo later by replacing the “LOGO” placeholder in
                  the PDF generator.
                </div>
                <button
                  type="button"
                  onClick={generatePdfInvoice}
                  disabled={lines.length === 0}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate PDF
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                Setup checklist (beginner-friendly)
              </h2>
              <div className="mt-3 space-y-3 text-sm text-zinc-700">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold text-zinc-600">
                    1) Supabase table
                  </div>
                  <div className="mt-1 text-sm">
                    Create `factory_products` with columns `item_name`, `price`,
                    `size`.
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold text-zinc-600">
                    2) Environment variables
                  </div>
                  <div className="mt-1 text-sm">
                    Add `NEXT_PUBLIC_SUPABASE_URL` and
                    `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `simplebilling/.env.local`.
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs font-semibold text-zinc-600">
                    3) Run the app
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-zinc-800">
                    cd simplebilling
                    <br />
                    npm run dev
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
                <div className="font-semibold">Invoice Generator</div>
                <div className="mt-1 text-sm text-blue-900/90">
                  The PDF includes a logo placeholder, a professional item table,
                  terms, and a signature box.
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">Preview</h3>
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">
                  Current total
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                  {formatMoney(grandTotal)}
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  Items: {lines.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
