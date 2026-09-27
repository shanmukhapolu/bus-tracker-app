import type { ReactNode } from "react";
import { titleCase } from "./utils";
export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{titleCase(value)}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow ?? "TRANSPORTATION OPERATIONS"}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Loading({ text = "Loading data…" }: { text?: string }) {
  return (
    <div className="empty" role="status">
      <span className="spinner" />
      {text}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      {message}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className={"metric " + tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Fields({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="fields">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
