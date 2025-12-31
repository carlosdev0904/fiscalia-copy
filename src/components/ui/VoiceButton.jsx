import React, { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function VoiceButton({ onVoiceInput, disabled }) {
  const [isRecording, setIsRecording] = useState(false);

  const handleClick = () => {
    if (isRecording) {
      setIsRecording(false);
      // Stop recording logic
    } else {
      setIsRecording(true);
      // Start recording logic
      // Simulated voice input after 3 seconds
      setTimeout(() => {
        setIsRecording(false);
        onVoiceInput?.("Emitir nota fiscal de R$ 1.500 para João Silva, CPF 123.456.789-00, serviço de consultoria em marketing digital");
      }, 3000);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      disabled={disabled}
      className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
        isRecording
          ? 'bg-red-500 text-white'
          : 'bg-gradient-to-br from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <AnimatePresence mode="wait">
        {isRecording ? (
          <motion.div
            key="recording"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <MicOff className="w-6 h-6" />
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Mic className="w-6 h-6" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Recording pulse animation */}
      {isRecording && (
        <>
          <motion.div
            className="absolute inset-0 rounded-2xl bg-red-500"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-0 rounded-2xl bg-red-500"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
          />
        </>
      )}
    </motion.button>
  );
}