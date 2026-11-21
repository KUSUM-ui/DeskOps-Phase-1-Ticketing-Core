import app from "./app";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`DeskOps Ticketing Core Server listening on port ${PORT}`);
});
