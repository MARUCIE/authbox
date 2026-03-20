import { Composition } from "remotion";
import { AuthBoxDemo } from "./AuthBoxDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="AuthBoxDemo"
      component={AuthBoxDemo}
      durationInFrames={60 * 30} // 60 seconds at 30fps
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
