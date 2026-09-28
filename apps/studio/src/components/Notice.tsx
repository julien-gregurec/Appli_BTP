import { knownNotice } from "../lib/notices";
/** Renders only messages from the fixed notice list; anything else in the URL is ignored. */
export default function Notice({ message }: { message?: string }) {
  const text = knownNotice(message);
  return text ? (
    <p role="alert" className="notice">
      {text}
    </p>
  ) : null;
}
