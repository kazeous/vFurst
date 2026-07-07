export type PrintJobStatus = "queued" | "printing" | "printed" | "failed" | "fallback";

export type PrintJob = {
  id: string;
  label: string;
  zpl: string;
  status: PrintJobStatus;
  error?: string;
};

type NavigatorWithUsb = Navigator & {
  usb?: {
    requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<UsbDevice>;
  };
};

type UsbEndpoint = {
  direction: "in" | "out";
  endpointNumber: number;
};

type UsbAlternate = {
  endpoints: UsbEndpoint[];
};

type UsbInterface = {
  interfaceNumber: number;
  alternates: UsbAlternate[];
};

type UsbConfiguration = {
  interfaces: UsbInterface[];
};

type UsbDevice = {
  configuration: UsbConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
};

const zebraVendorIds = [0x0a5f, 0x05e0];

export function getWebUsbSupport() {
  if (typeof navigator === "undefined") {
    return {
      supported: false,
      message: "Printer access is available in the browser only."
    };
  }

  const usb = (navigator as NavigatorWithUsb).usb;

  if (!usb) {
    return {
      supported: false,
      message: "Direct Zebra printing requires WebUSB in Chrome or Edge. Download the PDF badge sheet for manual printing in this browser."
    };
  }

  return {
    supported: true,
    message: "WebUSB printer support is available."
  };
}

export async function requestZebraPrinter() {
  const usb = (navigator as NavigatorWithUsb).usb;

  if (!usb) {
    throw new Error(getWebUsbSupport().message);
  }

  return usb.requestDevice({
    filters: zebraVendorIds.map((vendorId) => ({ vendorId }))
  });
}

export async function sendZplToPrinter(device: UsbDevice, zpl: string) {
  await device.open();

  if (device.configuration == null) {
    await device.selectConfiguration(1);
  }

  const iface = device.configuration?.interfaces.find((item) => item.alternates.some((alternate) => alternate.endpoints.some((endpoint) => endpoint.direction === "out")));
  const alternate = iface?.alternates.find((item) => item.endpoints.some((endpoint) => endpoint.direction === "out"));
  const endpoint = alternate?.endpoints.find((item) => item.direction === "out");

  if (iface == null || endpoint == null) {
    throw new Error("The selected USB device does not expose a writable printer endpoint.");
  }

  await device.claimInterface(iface.interfaceNumber);
  const encoded = new TextEncoder().encode(zpl);
  await device.transferOut(endpoint.endpointNumber, encoded);
  await device.close();
}

export async function printZplQueue(jobs: PrintJob[], onUpdate: (jobs: PrintJob[]) => void) {
  const support = getWebUsbSupport();

  if (!support.supported) {
    onUpdate(jobs.map((job) => ({ ...job, status: "fallback", error: support.message })));
    return;
  }

  const device = await requestZebraPrinter();
  const nextJobs = [...jobs];

  for (const job of nextJobs) {
    job.status = "printing";
    onUpdate([...nextJobs]);

    try {
      await sendZplToPrinter(device, job.zpl);
      job.status = "printed";
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Printer failed.";
    }

    onUpdate([...nextJobs]);
  }
}
