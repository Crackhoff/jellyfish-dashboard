import { useEffect, useState } from 'react';
import { JsonComponent } from '../components/JsonComponent';
import { getArrayValue, getStringValue, useLocalStorageState } from '../components/LogSelector';
import { CloseButton } from '../components/CloseButton';
import { BadgeStatus } from '../components/Badge';
import { CopyToClipboardButton } from '../components/CopyButton';
import { useSettings } from '../components/ServerSdkContext';
import { useLogging } from '../components/useLogging';
import { useConnectionToasts } from '../components/useConnectionToasts';
import { showToastError } from '../components/Toasts';
import { SignalingUrl } from '@jellyfish-dev/react-client-sdk';
import { TrackEncoding } from '@jellyfish-dev/membrane-webrtc-js';
import { useStore } from './RoomsContext';
import { getBooleanValue } from '../utils/localStorageUtils';
import { StreamingSettingsPanel } from './StreamingSettingsPanel';
import { mockStreamNames, DeviceIdToStream, StreamInfo } from '../components/VideoDeviceSelector';
import { VscClose } from 'react-icons/vsc';
import { StreamedTrackCard } from './StreamedTrackCard';
import { RecievedTrackPanel } from './RecievedTrackPanel';
type ClientProps = {
  roomId: string;
  peerId: string;
  token: string | null;
  name: string;
  refetchIfNeeded: () => void;
  remove: (roomId: string) => void;
  setToken: (token: string) => void;
  removeToken: () => void;
};

type Disconnect = null | (() => void);

const DEFAULT_TRACK_METADATA = `{
  "name": "track-name",
  "type": "canvas"
}
`;

export type track = {
  id: string;
  isMetadataOpen: boolean;
  simulcast: boolean;
  encodings: TrackEncoding[] | null;
};

export const Client = ({
  roomId,
  peerId,
  token,
  name,
  refetchIfNeeded,
  remove,
  removeToken,
  setToken,
}: ClientProps) => {
  const { state, dispatch } = useStore();
  const client = state.rooms[roomId].peers[peerId].client;

  const connect = client.useConnect();
  const [disconnect, setDisconnect] = useState<Disconnect>(() => null);
  const fullState = client.useSelector((snapshot) => ({
    local: snapshot.local,
    remote: snapshot.remote,
    bandwidthEstimation: snapshot.bandwidthEstimation,
    status: snapshot.status,
  }));
  const api = client.useSelector((snapshot) => snapshot.connectivity.api);
  const jellyfishClient = client.useSelector((snapshot) => snapshot.connectivity.client);
  const { signalingHost, signalingPath, signalingProtocol } = useSettings();

  const [show, setShow] = useLocalStorageState(`show-json-${peerId}`);
  const [expandedToken, setExpandedToken] = useState(false);
  const [tracksId, setTracksId] = useState<(track | null)[]>([]);
  const [tokenInput, setTokenInput] = useState<string>('');

  const isThereAnyTrack =
    Object.values(fullState?.remote || {}).flatMap(({ tracks }) => Object.values(tracks)).length > 0;
  useLogging(jellyfishClient);
  useConnectionToasts(jellyfishClient);
  const [maxBandwidth, setMaxBandwidth] = useState<string | null>(getStringValue('max-bandwidth'));
  const [trackMetadata, setTrackMetadata] = useState<string | null>(getStringValue('track-metadata'));
  const [attachMetadata, setAddMetadata] = useState(getBooleanValue('attach-metadata'));
  const [simulcastTransfer, setSimulcastTransfer] = useState(getBooleanValue('simulcast'));
  const [simulcastRecieving, setSimulcastRecieving] = useState(getStringValue('simulcast-recieving'));
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(
    getStringValue('selected-video-stream') || null,
  );
  const [activeVideoStreams, setActiveVideoStreams] = useState<DeviceIdToStream | null>(null);
  const [currentEncodings, setCurrentEncodings] = useState(
    (getArrayValue('current-encodings') as TrackEncoding[]) || ['h', 'm', 'l'],
  );

  const changeEncodingRecieved = (trackId: string, encoding: TrackEncoding) => {
    if (!fullState) return;
    {
      api?.setTargetTrackEncoding(trackId, encoding);
      console.log('changed encoding'); //does not work but probably error on backend side
    }
  };

  const changeEncoding = (trackId: string, encoding: TrackEncoding, desiredState: boolean) => {
    console.log('change encoding' + trackId + encoding + desiredState);
    if (!trackId) return;
    if (desiredState) {
      api?.enableTrackEncoding(trackId, encoding);
    } else {
      api?.disableTrackEncoding(trackId, encoding);
    }
  };

  const addTrack = (stream: MediaStream) => {
    const track: MediaStreamTrack = stream?.getVideoTracks()[0];
    if (!stream || !track) return;
    const trackId = api?.addTrack(
      track,
      stream,
      attachMetadata ? JSON.parse(trackMetadata || DEFAULT_TRACK_METADATA) : undefined,
      { enabled: simulcastTransfer, active_encodings: currentEncodings },
      parseInt(maxBandwidth || '0') || undefined,
    );
    if (!trackId) throw Error('Adding track error!');
    setTracksId([
      ...tracksId.filter((id) => id !== null),
      {
        id: trackId,
        isMetadataOpen: false,
        simulcast: simulcastTransfer,
        encodings: new Array<TrackEncoding>(...currentEncodings).sort(function (x, y) {
          // works since x,y can be only l,m,h
          if (y === 'h') return -1;
          if (y === 'm') return -1;
          return 1;
        }),
      },
    ]);
  };

  return (
    <div className='flex flex-col'>
      <div className='card w-150 bg-base-100 shadow-xl m-2 indicator'>
        <CloseButton
          onClick={() => {
            remove(roomId);
            setTimeout(() => {
              refetchIfNeeded();
            }, 500);
          }}
        />
        <div className='card-body m-2'>
          <div className='flex flex-row'>
            <div className='tooltip tooltip-top   tooltip-primary' data-tip={fullState?.status}>
              <BadgeStatus status={fullState?.status} />
            </div>
            <h1 className='card-title'>
              Client: <span className='text-xs'>{peerId}</span>
              <CopyToClipboardButton text={peerId} />{' '}
            </h1>

            {disconnect ? (
              <button
                className='btn btn-sm btn-error m-2'
                onClick={() => {
                  disconnect();
                  setDisconnect(() => null);
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                }}
              >
                Disconnect
              </button>
            ) : (
              <button
                className='btn btn-sm btn-success m-2'
                disabled={!token}
                onClick={() => {
                  if (!token) {
                    showToastError('Cannot connect to Jellyfish server because token is empty');
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
                  console.log('Connecting!');
                  const disconnect = connect({
                    peerMetadata: { name },
                    token,
                    signaling: singling,
                  });
                  setTimeout(() => {
                    refetchIfNeeded();
                  }, 500);
                  setDisconnect(() => disconnect);
                }}
              >
                Connect
              </button>
            )}
          </div>
          <div>
            <div className='flex flex-row items-center'>
              {token ? (
                <div className='flex flex-shrink flex-auto justify-between'>
                  <div id='textContainer' className='overflow-hidden '>
                    <span
                      className={`${
                        expandedToken ? 'whitespace-normal' : 'whitespace-nowrap'
                      } cursor-pointer break-all pr-6`}
                      onClick={() => setExpandedToken(!expandedToken)}
                    >
                      Token:{' '}
                      {token.length > 20 && !expandedToken
                        ? `...${token.slice(token.length - 20, token.length)}`
                        : token}
                    </span>
                  </div>
                  <div className='flex flex-auto flex-wrap place-items-center'>
                    <CopyToClipboardButton text={token} />
                    {token && (
                      <button className='btn btn-sm mx-1 my-0 btn-error' onClick={removeToken}>
                        <VscClose size={20} />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type='text'
                    placeholder='Type here'
                    className='input input-bordered w-full max-w-xs'
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                    }}
                  />
                  <button className='btn btn-sm m-2 btn-success' onClick={() => setToken(tokenInput)}>
                    Save token
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className='flex flex-row flex-wrap items-start content-start justify-between'>
            <div className='overflow-auto flex-wrap w-full'>
              <button
                className='btn btn-sm m-2'
                onClick={() => {
                  setShow(!show);
                }}
              >
                {show ? 'Hide state details' : 'Show state details'}
              </button>
              {show && <JsonComponent state={fullState} />}
            </div>
          </div>
        </div>
      </div>
      {tracksId.map((trackId) => (
        <>
          {trackId && (
            <StreamedTrackCard
              trackInfo={trackId}
              tracksId={tracksId}
              setTracksId={setTracksId}
              allTracks={fullState?.local?.tracks || {}}
              trackMetadata={trackMetadata || DEFAULT_TRACK_METADATA}
              removeTrack={(trackId) => {
                if (!trackId) return;
                api?.removeTrack(trackId);
              }}
              changeEncoding={changeEncoding}
              simulcastTransfer={simulcastTransfer}
            />
          )}
        </>
      ))}
      <div className='card w-150 bg-base-100 shadow-xl m-2 p-2 indicator'>
        <div className='card-body flex flex-row flex-wrap items-start content-start place-content-between p-2 m-2'>
          <StreamingSettingsPanel
            addTrack={addTrack}
            name={name}
            client={peerId}
            attachMetadata={attachMetadata}
            setAttachMetadata={setAddMetadata}
            simulcast={simulcastTransfer}
            setSimulcast={setSimulcastTransfer}
            trackMetadata={trackMetadata}
            setTrackMetadata={setTrackMetadata}
            maxBandwidth={maxBandwidth}
            setMaxBandwidth={setMaxBandwidth}
            selectedVideoId={selectedVideoId}
            setSelectedVideoId={setSelectedVideoId}
            activeVideoStreams={activeVideoStreams}
            setActiveVideoStreams={setActiveVideoStreams}
            currentEncodings={currentEncodings}
            setCurrentEncodings={setCurrentEncodings}
          />
        </div>
      </div>
      <div className='card w-150 bg-base-100 shadow-xl m-2 indicator'>
        {isThereAnyTrack && (
          <div className='card-body m-2'>
            <h1 className='card-title'>Remote tracks:</h1>
            {Object.values(fullState?.remote || {}).map(({ id, metadata, tracks }) => {
              return (
                <div key={id}>
                  <h4>From: {metadata?.name}</h4>
                  <div>
                    {Object.values(tracks || {}).map(({ stream, trackId, metadata }) => (
                      <RecievedTrackPanel
                        trackId={trackId}
                        stream={stream}
                        trackMetadata={metadata}
                        changeEncodingRecieved={changeEncodingRecieved}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div />
    </div>
  );
};
