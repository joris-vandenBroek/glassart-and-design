export interface BtwTarief {
  land: string;
  percentage: number;
}

export interface BtwTarieven {
  tarieven: BtwTarief[];
  standaardPercentage: number;
}
