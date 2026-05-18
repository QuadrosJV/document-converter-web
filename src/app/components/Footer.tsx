import { FileText } from "lucide-react";
import { useNavigate } from "react-router";

export function Footer() {
  const navigate = useNavigate();

  return (
    <footer className="border-t py-8 px-4 sm:px-6" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
        {/* Brand */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            <FileText size={12} className="text-white" />
          </div>
          <span className="text-white/50 text-sm">
            <span className="text-white/70">Doc</span>Transforma
          </span>
        </div>

        {/* Links */}
        <nav className="flex items-center gap-4">
          {[
            { label: "Conversor", path: "/" },
            { label: "Editor", path: "/editor" },
          ].map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="text-white/30 hover:text-white/60 text-xs transition-colors cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Status */}
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-white/25 text-xs">100% local · gratuito</span>
        </div>
      </div>

      <p className="text-white/15 text-xs text-center mt-4">
        Conversão de arquivos no navegador · Seus dados nunca saem do dispositivo
      </p>
    </footer>
  );
}
