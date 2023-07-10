import { useState } from "react";
import { createStream } from "../utils/createMockStream";
import { VideoTile } from "./VideoTile";
import { CanvasTile } from "./CanvasTile";
import { enumerateDevices, EnumerateDevices } from "@jellyfish-dev/browser-media-utils";

export type StreamInfo = {
  stream: MediaStream;
  id: string;
};
export type DeviceIdToStream = Record<string, StreamInfo>;

type Props = {
  selectedVideoStream: StreamInfo | null;
  setSelectedVideoStream: (cameraId: StreamInfo | null) => void;
  activeVideoStreams: DeviceIdToStream | null;
  setActiveVideoStreams: (
    setter: ((prev: DeviceIdToStream | null) => DeviceIdToStream) | DeviceIdToStream | null
  ) => void;
  // streamInfo: StreamInfo | null;
};

export const heartStream: StreamInfo = {
  stream: createStream("💜", "black", 24).stream,
  id: "HEART_STREAM",
};
export const frogStream: StreamInfo = {
  stream: createStream("🐸", "black", 24).stream,
  id: "FROG_STREAM",
};
export const elixirStream: StreamInfo = {
  stream: createStream("🧪", "black", 24).stream,
  id: "ELIXIR_STREAM",
};
export const octopusStream: StreamInfo = {
  stream: createStream("🐙", "black", 24).stream,
  id: "OCTOPUS_STREAM",
};

const mockStreams = [octopusStream, elixirStream, frogStream, heartStream];

export const VideoDeviceSelector = ({
  selectedVideoStream,
  setSelectedVideoStream,
  activeVideoStreams,
  setActiveVideoStreams,
}: Props) => {
  const [enumerateDevicesState, setEnumerateDevicesState] = useState<EnumerateDevices | null>(null);

  return (
    <div>
      <div className="m-2">
        <button
            className="btn btn-sm btn-info mx-1 my-0 w-full"
            onClick={() => {
              enumerateDevices({}, false)
                  .then((result) => {
                    console.log({ "OK: ": result });
                    setEnumerateDevicesState(result);
                  })
                  .catch((error) => {
                    console.log("Error caught " + error);
                    setEnumerateDevicesState(error);
                  });
            }}
        >
          List video devices
        </button>
      </div>

      <div className="flex flex-row flex-wrap m-2 w-full">
        {enumerateDevicesState?.video.type === "OK" &&
          enumerateDevicesState.video.devices.map(({ deviceId, label }) => (
            <VideoTile
              key={deviceId}
              deviceId={deviceId}
              label={label}
              setActiveVideoStreams={setActiveVideoStreams}
              setSelectedVideoStream={setSelectedVideoStream}
              selected={selectedVideoStream?.id === deviceId}
              streamInfo={(activeVideoStreams && activeVideoStreams[deviceId]) || null}
            />
          ))}
        {mockStreams?.map((stream) => (
          <CanvasTile
            key={stream.id}
            label={stream.id}
            setSelectedVideoStream={setSelectedVideoStream}
            selected={selectedVideoStream?.id === stream.id}
            streamInfo={stream}
          />
        ))}
      </div>
    </div>
  );
};
