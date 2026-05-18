import { motion } from "motion/react";
import { Upload, Settings2, Download } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Faça o upload",
    desc: "Arraste um arquivo ou tire foto com a câmera do celular.",
    color: "#6366f1",
  },
  {
    icon: Settings2,
    number: "02",
    title: "Escolha o formato",
    desc: "Selecione entre 19+ formatos de saída disponíveis.",
    color: "#8b5cf6",
  },
  {
    icon: Download,
    number: "03",
    title: "Baixe o resultado",
    desc: "Clique em Baixar quando estiver pronto. Salvo no Histórico.",
    color: "#5eead4",
  },
];

export function HowItWorks() {
  return (
    <section className="py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="flex sm:flex-col items-start sm:items-start gap-4 p-4 sm:p-5 rounded-2xl border"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  borderColor: "rgba(255,255,255,0.07)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${step.color}14`, border: `1px solid ${step.color}22` }}
                >
                  <Icon size={18} style={{ color: step.color }} />
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: step.color, opacity: 0.6, fontWeight: 600 }}>
                    {step.number}
                  </p>
                  <p className="text-white/70 text-sm font-medium">{step.title}</p>
                  <p className="text-white/30 text-xs mt-0.5 leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
