import {
	BackdropZoom,
	Clip,
	CloudBackground,
	Image,
	Lottie,
	Timeline,
} from "@/dsl";

export const testTimeline = (
	<Timeline>
		<CloudBackground
			id="cloudBackground1"
			name="云彩背景"
			width={1920}
			height={1080}
			left={0}
			top={0}
			speed={0.5}
			cloudDensity={1.2}
			skyColor="#87CEEB"
			cloudColor="#FFFFFF"
			start={0}
			end={60}
		/>
		{/* <Group
			id="group1"
			name="group1group1group1group1"
			width={500}
			height={500}
			left={250}
			top={0}
		></Group> */}

		<Image
			id="image1"
			name="image1"
			width={500}
			height={500}
			left={1150}
			top={50}
			uri="/logo512.png"
			start={20}
			end={30}
		/>
		<Clip
			id="clip1"
			name="clip1"
			width={700}
			height={700}
			left={250}
			top={250}
			uri="/intro.mp4"
			start={0}
			end={10}
		/>
		<Image
			id="image2"
			name="image2"
			width={500}
			height={500}
			left={1250}
			top={250}
			uri="/photo.jpeg"
			start={10}
			end={20}
		/>
		<BackdropZoom
			id="backdropZoom1"
			name="backdropZoom1"
			width={300}
			height={300}
			left={200}
			top={250}
			zoom={1.5}
			shape="circle"
			cornerRadius={16}
			start={0}
			end={30}
		/>
		{/* Lottie 动画示例 - 替换 uri 为你的 Lottie JSON 文件路径 */}
		<Lottie
			id="lottie1"
			name="Lottie 动画"
			width={400}
			height={400}
			left={600}
			top={600}
			uri={
				// "https://lottie.host/17c092dd-0d99-4860-bd7d-aa399a4b1632/KHnUgPc0xi.json"
				"https://lottie.host/ef736ee6-697d-4122-a0eb-25d0e4d57118/8o8SbelHRF.lottie"
			}
			speed={1.0}
			loop={true}
			start={5}
			end={25}
		/>
	</Timeline>
);
