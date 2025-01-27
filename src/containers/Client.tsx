import { Fragment, useRef, useState } from "react";
import { JsonComponent } from "../components/JsonComponent";
import { getArrayValue, getStringValue, useLocalStorageState } from "../components/LogSelector";
import { CloseButton } from "../components/CloseButton";
import { BadgeStatus } from "../components/Badge";
import { CopyToClipboardButton } from "../components/CopyButton";
import { useServerSdk } from "../components/ServerSdkContext";
import { useLogging } from "../components/useLogging";
import { useConnectionToasts } from "../components/useConnectionToasts";
import { showToastError } from "../components/Toasts";
import { SignalingUrl } from "@jellyfish-dev/react-client-sdk";
import { TrackEncoding } from "@jellyfish-dev/react-client-sdk";
import { useStore } from "./RoomsContext";
import { getBooleanValue } from "../utils/localStorageUtils";
import { DeviceInfo, StreamingSettingsPanel } from "./StreamingSettingsPanel";
import { DeviceIdToStream } from "../components/StreamingDeviceSelector";
import { VscClose } from "react-icons/vsc";
import { StreamedTrackCard } from "./StreamedTrackCard";
import { ReceivedTrackPanel } from "./ReceivedTrackPanel";
import { GenerateQRCodeButton } from "../components/GenerateQRCodeButton";

type ClientProps = {
  roomId: string;
  peerId: string;
  token: string | null;
  id: string;
  refetchIfNeeded: () => void;
  remove: (roomId: string) => void;
  setToken: (token: string) => void;
  removeToken: () => void;
};

export const DEFAULT_TRACK_METADATA = `{
  "name": "track-name",
  "type": "canvas"
}
`;

export type LocalTrack = {
  id: string;
  isMetadataOpened: boolean;
  type: "audio" | "video";
  simulcast?: boolean;
  encodings?: TrackEncoding[];
  stream: MediaStream;
  track: MediaStreamTrack;
  enabled: boolean;
};

export const Client = ({ roomId, peerId, token, id, refetchIfNeeded, remove, removeToken, setToken }: ClientProps) => {
  const { state, dispatch } = useStore();
  const client = state.rooms[roomId].peers[peerId].client;
  const tracks = state.rooms[roomId].peers[peerId].tracks || [];

  const connect = client.useConnect();
  const disconnect = client.useDisconnect();
  const fullState = client.useSelector((snapshot) => ({
    local: snapshot.local,
    remote: snapshot.remote,
    bandwidthEstimation: snapshot.bandwidthEstimation,
    status: snapshot.status,
    tracks: snapshot.tracks,
  }));

  const api = client.useSelector((snapshot) => snapshot.connectivity.api);
  const jellyfishClient = client.useSelector((snapshot) => snapshot.connectivity.client);
  const { signalingHost, signalingPath, signalingProtocol } = useServerSdk();
  const [show, setShow] = useLocalStorageState(`show-json-${peerId}`);
  const [expandedToken, setExpandedToken] = useState(false);
  const [tokenInput, setTokenInput] = useState<string>("");
  const statusRef = useRef(fullState?.status);
  statusRef.current = fullState?.status;
  const isThereAnyTrack = Object.keys(fullState?.tracks || {}).length > 0;

  useLogging(jellyfishClient);
  useConnectionToasts(jellyfishClient);
  const [maxBandwidth, setMaxBandwidth] = useState<string | null>(getStringValue("max-bandwidth"));
  const [trackMetadata, setTrackMetadata] = useState<string | null>(getStringValue("track-metadata"));
  const [attachMetadata, setAddMetadata] = useState(getBooleanValue("attach-metadata"));
  const [simulcastTransfer, setSimulcastTransfer] = useState(getBooleanValue("simulcast"));
  const [selectedDeviceId, setSelectedDeviceId] = useState<DeviceInfo | null>(
    {
      id: getStringValue("selected-device-stream") || "",
      type: getStringValue("selected-device-type") || "",
    } || null,
  );
  const [activeStreams, setActiveStreams] = useState<DeviceIdToStream | null>(null);
  const [currentEncodings, setCurrentEncodings] = useState(
    (getArrayValue("current-encodings") as TrackEncoding[]) || ["h", "m", "l"],
  );

  const changeEncodingReceived = (trackId: string, encoding: TrackEncoding) => {
    if (!fullState) return;
    api?.setTargetTrackEncoding(trackId, encoding);
  };

  const changeEncoding = (trackId: string, encoding: TrackEncoding, desiredState: boolean) => {
    if (!trackId) return;
    if (desiredState) {
      api?.enableTrackEncoding(trackId, encoding);
    } else {
      api?.disableTrackEncoding(trackId, encoding);
    }
  };

  const addVideoTrack = (stream: MediaStream) => {
    const track: MediaStreamTrack = stream?.getVideoTracks()[0];
    if (!stream || !track) return;
    const trackId = api?.addTrack(
      track,
      stream,
      attachMetadata ? JSON.parse(trackMetadata?.trim() || DEFAULT_TRACK_METADATA) : undefined,
      { enabled: simulcastTransfer, active_encodings: currentEncodings },
      parseInt(maxBandwidth || "0") || undefined,
    );
    if (!trackId) throw Error("Adding track error!");
    const streams = { ...activeStreams };
    setActiveStreams({ ...streams, [trackId]: { stream, id: trackId } });

    dispatch({
      type: "ADD_TRACK",
      roomId: roomId,
      peerId: peerId,
      track: {
        id: trackId,
        track: track,
        stream: stream,
        isMetadataOpened: false,
        type: "video",
        simulcast: simulcastTransfer,
        encodings: currentEncodings,
        enabled: true,
      },
    });
  };

  const addAudioTrack = (stream: MediaStream) => {
    const track: MediaStreamTrack = stream?.getAudioTracks()[0];
    if (!stream || !track) return;
    const trackId = api?.addTrack(
      track,
      stream,
      attachMetadata ? JSON.parse(trackMetadata?.trim() || DEFAULT_TRACK_METADATA) : undefined,
      undefined,
      parseInt(maxBandwidth || "0") || undefined,
    );
    if (!trackId) throw Error("Adding track error!");
    setActiveStreams({ ...activeStreams, [trackId]: { stream, id: trackId } });
    dispatch({
      type: "ADD_TRACK",
      roomId: roomId,
      peerId: peerId,
      track: {
        id: trackId,
        track: track,
        stream: stream,
        isMetadataOpened: false,
        type: "audio",
        enabled: true,
      },
    });
  };

  return (
    <div className="flex flex-col gap-1 mx-1">
      <div className="card w-150 bg-base-100 shadow-xl indicator">
        <CloseButton
          onClick={() => {
            remove(roomId);
            setTimeout(() => {
              refetchIfNeeded();
            }, 500);
          }}
        />
        <div className="card-body p-4">
          <div className="flex flex-row justify-between">
            <h1 className="card-title relative">
              <div className="z-10">
                Client: <span className="text-xs">{peerId}</span>
              </div>
              <div className="tooltip tooltip-top tooltip-primary absolute -ml-3 -mt-1 " data-tip={fullState?.status}>
                <BadgeStatus status={fullState?.status} />
              </div>
              <CopyToClipboardButton text={peerId} />
            </h1>

            {fullState.status === "joined" ? (
              <button
                className="btn btn-sm btn-error m-2"
                onClick={() => {
                  disconnect();
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="btn btn-sm btn-success m-2"
                disabled={!token}
                onClick={() => {
                  if (!token) {
                    showToastError("Cannot connect to Jellyfish server because token is empty");
                    return;
                  }
                  const singling: SignalingUrl | undefined =
                    signalingHost && signalingProtocol && signalingPath
                      ? {
                          host: signalingHost,
                          protocol: signalingProtocol,
                          path: signalingPath,
                        }
                      : undefined;
                  connect({
                    peerMetadata: { name: id },
                    token,
                    signaling: singling,
                  });
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                  setTimeout(() => {
                    console.log(statusRef.current);
                    if (statusRef.current === "joined") return;
                    disconnect();
                    showToastError("Unable to connect, try again");
                  }, 3000);
                }}
              >
                Connect
              </button>
            )}
          </div>
          <div className="flex flex-row items-center">
            {token ? (
              <div className="flex flex-shrink flex-auto justify-between">
                <div id="textContainer" className="overflow-hidden ">
                  <span
                    className={`${
                      expandedToken ? "whitespace-normal" : "whitespace-nowrap"
                    } cursor-pointer break-all pr-6`}
                    onClick={() => setExpandedToken(!expandedToken)}
                  >
                    Token:{" "}
                    {token.length > 20 && !expandedToken ? `...${token.slice(token.length - 20, token.length)}` : token}
                  </span>
                </div>
                <div className="flex flex-auto flex-wrap place-items-center justify-between">
                  <div>
                    <CopyToClipboardButton text={token} />
                    <GenerateQRCodeButton
                      textToQR={token}
                      description={"Scan this QR Code to access the token from your mobile device:"}
                    />
                  </div>

                  {token && (
                    <button
                      className="btn btn-sm mx-1 my-0 btn-error  tooltip tooltip-error  tooltip-top z-10"
                      data-tip={"REMOVE"}
                      onClick={removeToken}
                    >
                      <VscClose size={20} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Type here"
                  className="input input-bordered w-full max-w-xs"
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                  }}
                />
                <button className="btn btn-sm m-2 btn-success" onClick={() => setToken(tokenInput)}>
                  Save token
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-row flex-wrap items-start content-start justify-between">
            <div className="overflow-auto flex-wrap w-full">
              <button
                className="btn btn-sm m-2"
                onClick={() => {
                  setShow(!show);
                }}
              >
                {show ? "Hide client state " : "Show client state "}
              </button>
              {show && <JsonComponent state={fullState} />}
            </div>
          </div>
        </div>
      </div>
      {fullState.status === "joined" &&
        Object.values(tracks).map((track) => (
          <Fragment key={track?.id || "nope"}>
            {track && (
              <StreamedTrackCard
                trackInfo={track}
                peerId={peerId}
                roomId={roomId}
                allTracks={fullState?.local?.tracks || {}}
                trackMetadata={trackMetadata || DEFAULT_TRACK_METADATA}
                removeTrack={(trackId) => {
                  if (!trackId) return;
                  track.stream?.getTracks().forEach((track) => {
                    track.stop();
                  });
                  api?.removeTrack(trackId);
                  dispatch({ type: "REMOVE_TRACK", peerId, roomId, trackId });
                }}
                changeEncoding={changeEncoding}
                simulcastTransfer={track.type === "audio" ? false : simulcastTransfer}
              />
            )}
          </Fragment>
        ))}
      {fullState.status === "joined" && (
        <div className="card w-150 bg-base-100 shadow-xl indicator">
          <div className="card-body p-4">
            <StreamingSettingsPanel
              addVideoTrack={addVideoTrack}
              addAudioTrack={addAudioTrack}
              id={id}
              attachMetadata={attachMetadata}
              setAttachMetadata={setAddMetadata}
              simulcast={simulcastTransfer}
              setSimulcast={setSimulcastTransfer}
              trackMetadata={trackMetadata}
              setTrackMetadata={setTrackMetadata}
              maxBandwidth={maxBandwidth}
              setMaxBandwidth={setMaxBandwidth}
              selectedDeviceId={selectedDeviceId}
              setSelectedDeviceId={setSelectedDeviceId}
              activeStreams={activeStreams}
              setActiveStreams={setActiveStreams}
              currentEncodings={currentEncodings}
              setCurrentEncodings={setCurrentEncodings}
            />
          </div>
        </div>
      )}
      {fullState.status === "joined" && isThereAnyTrack && (
        <div className="card w-150 bg-base-100 shadow-xl indicator">
          <div className="card-body p-4">
            <h1 className="card-title">Remote tracks:</h1>
            {Object.values(fullState?.tracks || {}).map(
              ({ trackId, metadata, origin, stream, vadStatus, encoding, track }) => {
                return (
                  <div key={trackId}>
                    <h4>From: {origin.id}</h4>
                    <div>
                      <ReceivedTrackPanel
                        key={trackId}
                        vadStatus={vadStatus}
                        encodingReceived={encoding}
                        clientId={peerId}
                        trackId={trackId}
                        stream={stream}
                        trackMetadata={metadata}
                        changeEncodingReceived={changeEncodingReceived}
                        kind={track?.kind}
                      />
                    </div>
                  </div>
                );
              },
            )}
            <h4>Current bandwidth: {Math.round(Number(fullState.bandwidthEstimation)).toString()}</h4>
          </div>
        </div>
      )}
    </div>
  );
};
