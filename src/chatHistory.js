const saveChat = (userMessage, botResponse) => {
  const history =
    JSON.parse(localStorage.getItem("chatHistory")) || [];

  history.push({
    user: userMessage,
    bot: botResponse,
    date: new Date().toLocaleString(),
  });

  localStorage.setItem(
    "chatHistory",
    JSON.stringify(history)
  );
};