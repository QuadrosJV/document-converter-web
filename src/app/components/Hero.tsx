import { useNavigate } from "react-router";
import { PenLine, ArrowDown } from "lucide-react";

export function Hero() {
  const navigate = useNavigate();

  return (
    <section className="pt-24 pb-2 px-4 sm:px-6 text-center">
      <div className="max-w-2xl mx-auto">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.72rem" }}>
            100% local · sem uploads · sem cadastro
          </span>
        </div>

        <h1
          className="text-white"
          style={{
            fontSize: "clamp(1.8rem, 6vw, 3rem)",
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          Converta qualquer arquivo{" "}
          <span style={{ color: "#5eead4" }}>em segundos</span>
        </h1>

        <p
          className="mt-3 mx-auto"
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: "clamp(0.875rem, 2vw, 1rem)",
            lineHeight: 1.7,
            maxWidth: 460,
          }}
        >
          PDF, DOCX, XLSX, PNG, JPG, CSV, JSON e mais — converta qualquer
          formato diretamente no navegador, sem instalar nada.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7">
          <a
            href="#converter"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("converter")?.scrollIntoView({ behavior: "smooth" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 28px",
              borderRadius: 12,
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff",
              fontSize: "0.92rem",
              cursor: "pointer",
              textDecoration: "none",
              fontWeight: 600,
              width: "100%",
              maxWidth: 280,
              justifyContent: "center",
              boxShadow: "0 4px 24px rgba(99,102,241,0.35)",
            }}
          >
            <ArrowDown size={16} />
            Converter agora
          </a>

          <button
            onClick={() => navigate("/editor")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 24px",
              borderRadius: 12,
              background: "rgba(99,102,241,0.1)",
              color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.25)",
              fontSize: "0.92rem",
              cursor: "pointer",
              fontWeight: 600,
              width: "100%",
              maxWidth: 280,
              justifyContent: "center",
            }}
          >
            <PenLine size={16} />
            Abrir Editor de Documentos
          </button>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-5">
          {[
            "19+ formatos",
            "Anotações e assinaturas",
            "OCR integrado",
            "Câmera para escanear",
            "Histórico de conversões",
          ].map((f) => (
            <span key={f} style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.72rem" }}>
              ✓ {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
