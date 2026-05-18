import { useState } from "react";
import { Navbar } from "../components/Navbar";
import { Hero } from "../components/Hero";
import { Converter } from "../components/Converter";
import { HowItWorks } from "../components/HowItWorks";
import { Features } from "../components/Features";
import { Footer } from "../components/Footer";
import { History } from "../components/History";
import { ArrowLeftRight, Clock } from "lucide-react";

type Tab = "converter" | "historico";

export function HomePage() {
  const [tab, setTab] = useState<Tab>("converter");

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0b0c1b", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <Navbar />

      <main className="flex-1">
        {/* Hero — only show on converter tab */}
        {tab === "converter" && <Hero />}

        {/* Tab selector */}
        <div
          className="sticky top-14 z-30 flex justify-center px-4 pt-4 pb-3"
          style={{ background: "rgba(11,12,27,0.9)", backdropFilter: "blur(16px)" }}
        >
          <div
            className="flex rounded-xl p-1 gap-1"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <button
              onClick={() => setTab("converter")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-200 cursor-pointer text-sm"
              style={
                tab === "converter"
                  ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 600 }
                  : { color: "rgba(255,255,255,0.4)", fontWeight: 400 }
              }
            >
              <ArrowLeftRight size={14} />
              Conversor
            </button>
            <button
              onClick={() => setTab("historico")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-200 cursor-pointer text-sm"
              style={
                tab === "historico"
                  ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 600 }
                  : { color: "rgba(255,255,255,0.4)", fontWeight: 400 }
              }
            >
              <Clock size={14} />
              Histórico
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === "converter" ? (
          <>
            <Converter />
            <HowItWorks />
            <Features />
          </>
        ) : (
          <History />
        )}
      </main>

      <Footer />
    </div>
  );
}
