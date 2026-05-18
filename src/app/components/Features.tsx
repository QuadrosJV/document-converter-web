import { motion } from "motion/react";
import { Shield, Zap, Globe, Layers, Lock, History, Camera, PenLine } from "lucide-react";

const items = [
  { icon: Zap, title: "Conversão instantânea", desc: "Processamento no navegador. Sem servidores, sem espera.", color: "#f59e0b" },
  { icon: Shield, title: "100% privado", desc: "Seus arquivos nunca saem do dispositivo. Zero upload para a nuvem.", color: "#10b981" },
  { icon: Layers, title: "19+ formatos", desc: "DOCX, PDF, XLSX, PNG, JPG, HTML, JSON, CSV, XML, RTF e mais.", color: "#6366f1" },
  { icon: Camera, title: "Câmera integrada", desc: "Fotografe documentos físicos diretamente pelo celular.", color: "#ec4899" },
  { icon: History, title: "Histórico local", desc: "Acesse e baixe novamente qualquer arquivo já convertido.", color: "#3b82f6" },
  { icon: PenLine, title: "Editor de documentos", desc: "Anote, assine e edite PDFs e imagens como no PDFFiller.", color: "#8b5cf6" },
  { icon: Globe, title: "Funciona offline", desc: "Não precisa de internet após carregar a página.", color: "#06b6d4" },
  { icon: Lock, title: "Sem cadastro", desc: "Abra, converta e baixe. Sem conta, sem assinatura.", color: "#a78bfa" },
];

export function Features() {
  return (
    <section id="features" className="py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-white/40 text-xs tracking-widest uppercase mb-3" style={{ letterSpacing: "0.12em" }}>
            Por que usar
          </p>
          <h2 className="text-white" style={{ fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)", fontWeight: 700 }}>
            Tudo que sua empresa precisa
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.45 }}
                className="group rounded-2xl border p-4 hover:border-white/12 transition-all duration-300 relative overflow-hidden"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                  style={{ background: `radial-gradient(circle at 0% 0%, ${item.color}10, transparent 60%)` }}
                />
                <div className="relative z-10 flex gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}14`, border: `1px solid ${item.color}22` }}
                  >
                    <Icon size={17} style={{ color: item.color }} />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm font-medium mb-1">{item.title}</p>
                    <p className="text-white/30 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
