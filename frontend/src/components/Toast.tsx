import { useEffect } from "react";

interface Props {
  message: string;
  onClose: () => void;
}

export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 4200);
    return () => clearTimeout(id);
  }, [message, onClose]);

  return (
    <div className="app-toast" role="status">
      {message}
    </div>
  );
}