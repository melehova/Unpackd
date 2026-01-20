export type Box = {
  id: string;
  nfc_id: string | null;
  label: string | null;
  created_at: string;
};

export type Item = {
  id: string;
  box_id: string;
  name: string;
  quantity: number;
};
