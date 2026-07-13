export type TimestampResult = {
  dateUtc: string;
  provider: string;
  reference: string | null;
  qualifie: boolean;
};

export interface TimestampProvider {
  timestamp(empreinteSha256: string): Promise<TimestampResult>;
}

export class LocalServerTimestampProvider implements TimestampProvider {
  async timestamp(): Promise<TimestampResult> {
    return {
      dateUtc: new Date().toISOString(),
      provider: "local_server",
      reference: null,
      qualifie: false,
    };
  }
}

export function timestampProvider(): TimestampProvider {
  return new LocalServerTimestampProvider();
}
