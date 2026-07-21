"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { importStudents } from "@/lib/org-student-roster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NameMode = "full" | "split";

const NONE = "__none__";

function cellString(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function guessColumn(headers: string[], patterns: RegExp[]) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const pattern of patterns) {
    const idx = lower.findIndex((h) => pattern.test(h));
    if (idx >= 0) return headers[idx];
  }
  return "";
}

export function StudentBulkImport({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [nameMode, setNameMode] = useState<NameMode>("full");
  const [fullNameCol, setFullNameCol] = useState("");
  const [firstNameCol, setFirstNameCol] = useState("");
  const [lastNameCol, setLastNameCol] = useState("");
  const [batchCol, setBatchCol] = useState("");
  const [emailCol, setEmailCol] = useState("");
  const [isPending, startTransition] = useTransition();

  const columnItems = useMemo(
    () => [
      { value: NONE, label: "Not mapped" },
      ...headers.map((h) => ({ value: h, label: h })),
    ],
    [headers],
  );

  const preview = useMemo(() => {
    return rows.slice(0, 5).map((row, index) => {
      const full =
        nameMode === "full"
          ? cellString(fullNameCol ? row[fullNameCol] : "")
          : [cellString(firstNameCol ? row[firstNameCol] : ""), cellString(lastNameCol ? row[lastNameCol] : "")]
              .filter(Boolean)
              .join(" ");
      return {
        index: index + 1,
        name: full || "—",
        batch: cellString(batchCol && batchCol !== NONE ? row[batchCol] : ""),
        email: cellString(emailCol && emailCol !== NONE ? row[emailCol] : ""),
      };
    });
  }, [
    rows,
    nameMode,
    fullNameCol,
    firstNameCol,
    lastNameCol,
    batchCol,
    emailCol,
  ]);

  const resetFile = () => {
    setHeaders([]);
    setRows([]);
    setFileName("");
    setFullNameCol("");
    setFirstNameCol("");
    setLastNameCol("");
    setBatchCol("");
    setEmailCol("");
    setNameMode("full");
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error("Spreadsheet has no sheets.");
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
        raw: false,
      });
      if (json.length === 0) {
        toast.error("No data rows found in the first sheet.");
        return;
      }
      const cols = Object.keys(json[0] ?? {});
      if (cols.length === 0) {
        toast.error("Could not read column headers.");
        return;
      }

      setFileName(file.name);
      setHeaders(cols);
      setRows(json);

      const guessedFull = guessColumn(cols, [
        /^full\s*name$/,
        /^student\s*name$/,
        /^name$/,
      ]);
      const guessedFirst = guessColumn(cols, [/^first\s*name$/, /^firstname$/, /^first$/]);
      const guessedLast = guessColumn(cols, [/^last\s*name$/, /^lastname$/, /^surname$/, /^last$/]);
      const guessedBatch = guessColumn(cols, [
        /^batch$/,
        /^class$/,
        /^grade$/,
        /^section$/,
        /^batch\s*name$/,
      ]);
      const guessedEmail = guessColumn(cols, [/^email$/, /^e-mail$/, /^mail$/]);

      if (guessedFull) {
        setNameMode("full");
        setFullNameCol(guessedFull);
      } else if (guessedFirst || guessedLast) {
        setNameMode("split");
        setFirstNameCol(guessedFirst);
        setLastNameCol(guessedLast);
      } else {
        setNameMode("full");
        setFullNameCol(cols[0] ?? "");
      }
      setBatchCol(guessedBatch || NONE);
      setEmailCol(guessedEmail || NONE);
    } catch {
      toast.error("Could not read that file. Use .xlsx or .xls.");
    }
  };

  const onImport = () => {
    if (rows.length === 0) {
      toast.error("Upload a spreadsheet first.");
      return;
    }
    if (nameMode === "full" && !fullNameCol) {
      toast.error("Select the full name column.");
      return;
    }
    if (nameMode === "split" && !firstNameCol && !lastNameCol) {
      toast.error("Select first and/or last name columns.");
      return;
    }

    const mapped = rows.map((row) => {
      const full_name =
        nameMode === "full"
          ? cellString(row[fullNameCol])
          : [cellString(row[firstNameCol]), cellString(row[lastNameCol])]
              .filter(Boolean)
              .join(" ");
      const email =
        emailCol && emailCol !== NONE ? cellString(row[emailCol]) || null : null;
      const batch_name =
        batchCol && batchCol !== NONE
          ? cellString(row[batchCol]) || null
          : null;
      return { full_name, email, batch_name };
    });

    const emptyNames = mapped.filter((r) => !r.full_name).length;
    if (emptyNames === mapped.length) {
      toast.error("No student names found with the selected columns.");
      return;
    }

    startTransition(async () => {
      const result = await importStudents(mapped.filter((r) => r.full_name));
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const parts = [
        `${result.created ?? 0} added`,
        `${result.updated ?? 0} updated`,
      ];
      if ((result.failed ?? 0) > 0) {
        parts.push(`${result.failed} failed`);
        const first = result.errors?.[0];
        if (first) {
          toast.error(`Row ${first.row}: ${first.error}`);
        }
      }
      toast.success(`Import complete — ${parts.join(", ")}.`);
      setOpen(false);
      resetFile();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetFile();
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" disabled={disabled} />
        }
      >
        Import spreadsheet
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Upload your school Excel sheet, map name and batch columns, then
            create students and assign batches. Login usernames are optional —
            generate them later per student.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student_sheet">Excel file (.xlsx)</Label>
            <input
              id="student_sheet"
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={disabled || isPending}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length} rows
              </p>
            ) : null}
          </div>

          {headers.length > 0 && (
            <>
              <div className="space-y-2">
                <Label>Name columns</Label>
                <Select
                  value={nameMode}
                  onValueChange={(v) => setNameMode((v as NameMode) ?? "full")}
                  items={[
                    { value: "full", label: "Full name (one column)" },
                    { value: "split", label: "First + last name" },
                  ]}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full name (one column)</SelectItem>
                    <SelectItem value="split">First + last name</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {nameMode === "full" ? (
                <ColumnSelect
                  label="Full name"
                  value={fullNameCol || NONE}
                  items={columnItems}
                  onChange={(v) => setFullNameCol(v === NONE ? "" : v)}
                  required
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <ColumnSelect
                    label="First name"
                    value={firstNameCol || NONE}
                    items={columnItems}
                    onChange={(v) => setFirstNameCol(v === NONE ? "" : v)}
                  />
                  <ColumnSelect
                    label="Last name"
                    value={lastNameCol || NONE}
                    items={columnItems}
                    onChange={(v) => setLastNameCol(v === NONE ? "" : v)}
                  />
                </div>
              )}

              <ColumnSelect
                label="Batch"
                value={batchCol || NONE}
                items={columnItems}
                onChange={setBatchCol}
              />
              <ColumnSelect
                label="Email (optional)"
                value={emailCol || NONE}
                items={columnItems}
                onChange={setEmailCol}
              />

              <div className="rounded-lg border">
                <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Preview
                </p>
                <ul className="divide-y text-sm">
                  {preview.map((row) => (
                    <li key={row.index} className="px-3 py-2">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[row.batch && `Batch: ${row.batch}`, row.email]
                          .filter(Boolean)
                          .join(" · ") || "No batch / email"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={onImport}
            disabled={disabled || isPending || rows.length === 0}
          >
            {isPending ? "Importing…" : `Import ${rows.length || ""} students`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnSelect({
  label,
  value,
  items,
  onChange,
  required,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v ?? NONE)}
        items={items}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select column" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
