export async function downloadAnalysisPDF(messages, userName = "User") {
  // Dynamically import jsPDF to avoid SSR issues
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };

  const checkY = (needed = 10) => {
    if (y + needed > 275) addPage();
  };

  // Header
  doc.setFillColor(15, 98, 110);
  doc.rect(0, 0, pageW, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("⚕ DoctorBot AI — Health Analysis Report", margin, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Patient: ${userName}   |   Generated: ${new Date().toLocaleString()}`, margin, 27);
  y = 48;

  // Disclaimer
  doc.setFillColor(255, 243, 205);
  doc.roundedRect(margin, y, contentW, 12, 2, 2, "F");
  doc.setTextColor(133, 77, 14);
  doc.setFontSize(8);
  doc.text("⚠  This report is for informational purposes only. It does not constitute medical advice. Always consult a doctor.", margin + 4, y + 8);
  y += 20;

  const aiMessages = messages.filter((m) => m.role === "assistant");
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(11);
    doc.text("No analysis to export yet. Start a chat first.", margin, y);
    doc.save(`DoctorBot_Analysis_${Date.now()}.pdf`);
    return;
  }

  messages.forEach((msg, idx) => {
    checkY(20);

    if (msg.role === "user") {
      // User message
      doc.setFillColor(240, 247, 255);
      const lines = doc.splitTextToSize(`You: ${msg.content}`, contentW - 8);
      const boxH = lines.length * 5.5 + 8;
      checkY(boxH);
      doc.roundedRect(margin, y, contentW, boxH, 2, 2, "F");
      doc.setTextColor(30, 64, 175);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      lines.forEach((line, i) => {
        doc.text(line, margin + 4, y + 7 + i * 5.5);
      });
      doc.setFont("helvetica", "normal");
      y += boxH + 4;
    } else {
      // AI message
      doc.setFillColor(240, 253, 244);
      const lines = doc.splitTextToSize(msg.content, contentW - 8);
      const boxH = lines.length * 5.2 + 10;
      checkY(boxH);
      doc.roundedRect(margin, y, contentW, boxH, 2, 2, "F");
      doc.setTextColor(22, 101, 52);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "italic");
      doc.text("DoctorBot AI:", margin + 4, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 60, 30);
      lines.forEach((line, i) => {
        doc.text(line, margin + 4, y + 13 + i * 5.2);
      });
      y += boxH + 6;
    }
  });

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`DoctorBot AI — Page ${p} of ${totalPages}`, pageW / 2, 290, { align: "center" });
  }

  doc.save(`DoctorBot_Analysis_${new Date().toISOString().split("T")[0]}.pdf`);
}