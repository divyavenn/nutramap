import { motion } from 'framer-motion';
import styled from 'styled-components';

const NewsReelContainer = styled.div`
  margin-bottom: 3rem;
  overflow: hidden;
  position: relative;
  width: 600px;
`;

const NewsReelInner = styled(motion.div)`
  position: relative;
  height: 5rem;
  display: flex;
  align-items: center;
`;

const NewsReelScroller = styled(motion.div)`
  display: flex;
  gap: 1rem;
  white-space: nowrap;
`;


const IconLogoContainer = styled(motion.div)`
  display: flex;
  justify-content: center;
  margin-bottom: 3rem;
`;

const FeatureText = styled.span<{ $colorIndex: number }>`
  display: inline-block;
  padding: 0 1rem;
  color: ${props => {
    const colors = ['#d8b4fe', '#e9d5ff', '#ffffff', '#c084fc', '#f3e8ff'];
    return colors[props.$colorIndex % 5];
  }};
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
`;

  const features = [
    "world's first agent-friendly nutrition tracker",
    "one-click logging",
    "powered by AI, double-checked by humans",
    "2.7 million foods with proven nutrition data from USDA"
  ]

function CopyReelFeature({features, className}: {features: string[], className?: string}){
  return (
    <NewsReelContainer className={className}>
      <NewsReelInner
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.8 }}
      >
            <NewsReelScroller
              animate={{
                x: [0, -1600],
              }}
              transition={{
                x: {
                  repeat: Infinity,
                  repeatType: "loop",
                  duration: 30,
                  ease: "circInOut"
                },
              }}
            >
              {/* Repeat the features twice for seamless loop */}
              {[...features, ...features].map((feature, index) => (
                <FeatureText key={index} $colorIndex={index}>
                  {feature}
                </FeatureText>
              ))}
            </NewsReelScroller>
          </NewsReelInner>
        </NewsReelContainer>
  );
}

export{ CopyReelFeature }