"use client";

import { useId, useRef, useState } from "react";
import { FiUploadCloud } from "react-icons/fi";
import styles from "./trip-expenses.module.css";

export function ReceiptUpload({ disabled, onFiles }: { disabled: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  return <div>
    <p className={styles.receiptLabel}>Receipts <span className={styles.optional}>(optional)</span></p>
    <div onDragEnter={(event) => {
      event.preventDefault(); event.stopPropagation();
      if (disabled || !event.dataTransfer.types.includes("Files")) return;
      dragDepth.current += 1; setDragging(true);
    }} onDragOver={(event) => {
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }} onDragLeave={(event) => {
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    }} onDrop={(event) => {
      event.preventDefault(); event.stopPropagation();
      dragDepth.current = 0; setDragging(false);
      if (!disabled && event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files));
    }}>
      <button type="button" disabled={disabled} className={`${styles.receiptUploadButton} ${dragging && !disabled ? styles.receiptUploadActive : ""}`} aria-describedby={hintId} onClick={() => input.current?.click()}>
        <FiUploadCloud aria-hidden="true" />
        <strong>{dragging && !disabled ? "Drop your receipts here" : "Drag receipts here"}</strong>
        <span>or <b>choose files</b></span>
      </button>
      <input ref={input} type="file" hidden disabled={disabled} multiple accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Choose receipt files" onChange={(event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (files.length) onFiles(files);
      }} />
    </div>
    <p id={hintId} className={styles.receiptHint}>JPG, PNG, WebP or PDF · Up to 10 MB each. Uploaded when you save.</p>
  </div>;
}
