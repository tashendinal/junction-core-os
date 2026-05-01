import { promises as fs } from "fs";
import path from "path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RackSlot = {
  u_position: number;
  node_label: string;
  hw_id: string;
  ip_address: string;
  functional_role: string;
};

type Body = {
  slots: RackSlot[];
};

const CLUSTER_REL = ["..", "..", "os-core", "cluster.json"] as const;

function repoClusterPath(): string {
  return path.join(process.cwd(), ...CLUSTER_REL);
}

async function tryGrpcUpdate(slots: RackSlot[]): Promise<{ ok: boolean; message: string }> {
  const addr = process.env.CLUSTER_GRPC_ADDR;
  if (!addr) {
    return { ok: false, message: "CLUSTER_GRPC_ADDR not set; skipped gRPC (file written only)" };
  }

  try {
    const grpc = await import("@grpc/grpc-js");
    const protoLoader = await import("@grpc/proto-loader");
    const protoPath = path.join(process.cwd(), "..", "..", "shared", "proto", "junction.proto");
    const pkg = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const loaded = grpc.loadPackageDefinition(pkg) as Record<string, unknown>;
    const junction = loaded.junction as {
      ClusterControl: new (
        host: string,
        cred: import("@grpc/grpc-js").ChannelCredentials
      ) => {
        UpdateClusterLayout: (
          req: unknown,
          cb: (err: Error | null, res: { success?: boolean; message?: string } | undefined) => void
        ) => void;
      };
    };

    const client = new junction.ClusterControl(addr, grpc.credentials.createInsecure());
    const request = {
      slots: slots.map((s) => ({
        u_position: s.u_position,
        node_label: s.node_label,
        hw_id: s.hw_id,
        ip_address: s.ip_address,
        functional_role: s.functional_role,
      })),
    };

    await new Promise<void>((resolve, reject) => {
      client.UpdateClusterLayout(request, (err, res) => {
        if (err) reject(err);
        else if (res && res.success === false) reject(new Error(res.message || "ClusterControl rejected update"));
        else resolve();
      });
    });

    return { ok: true, message: `ClusterControl.UpdateClusterLayout ok @ ${addr}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `gRPC error (cluster file still updated): ${msg}` };
  }
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slots || !Array.isArray(body.slots)) {
    return NextResponse.json({ error: "Expected { slots: RackSlot[] }" }, { status: 400 });
  }

  const filePath = repoClusterPath();
  const doc = {
    version: 1,
    updated_at: new Date().toISOString(),
    slots: body.slots,
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

  const grpcResult = await tryGrpcUpdate(body.slots);

  return NextResponse.json({
    success: true,
    cluster_json_path: filePath,
    grpc: grpcResult,
  });
}
