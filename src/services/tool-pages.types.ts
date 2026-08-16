export type ToolKind = 'subs' | 'gpx';

export type ToolArtifact = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

export type ToolPageManifest = {
  kind: ToolKind;
  hash: string;
  title: string;
  pageUrl: string;
  createdAt: string;
  updatedAt: string;
  artifacts: ToolArtifact[];
};

export type UserToolPage = {
  kind: ToolKind;
  hash: string;
  title: string;
  pageUrl: string;
  createdAt: string;
  updatedAt: string;
};
