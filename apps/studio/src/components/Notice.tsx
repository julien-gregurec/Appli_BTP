export default function Notice({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="notice">
      {message.slice(0, 300)}
    </p>
  ) : null;
}
