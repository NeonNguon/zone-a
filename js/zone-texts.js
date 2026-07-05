// ================================================================
// ZoneTexts — the zones' titles + wall texts, verbatim, in ONE place.
// Plain string constants consumed by the info terminals (and anything else
// that needs them later). This file is UTF-8: Zone B contains Vietnamese
// diacritics ("số đề") and Zone B references Dürer — the canvas renderer
// draws them with system fonts, which handle both.
// ================================================================
window.ZoneTexts = {
  a: {
    title: "All the Places I Have Lived",
    text:
      "In All The Places I Have Lived I look at notions of home and belonging for migrants such as myself who live in what Homi Bhabha describes as a third space. I also aim to explore how Artificial Intelligence can be used as a tool to reveal something beyond the photographer's gaze and how it can be used to reveal, explore and critique the identity of a place. Since I moved from Germany to Ho Chi Minh City for the first time in 2004 I have lived in 9 different neighborhoods across the city. In this project I aim to explore these neighborhoods. Each of them represents a different period and station of my life as a Western immigrant to Vietnam. This approach closely connects to the autoethnographic methodology I am applying in my research. By creating a collection of photographs for each of these neighborhoods and then using them with the DreamBooth plugin in Stable Diffusion (a form of generative AI) I am able to first train my own AI models and then create images of places that do not exist as such, but that could have been. In this way I not only create images that go beyond pure documentary but also touch the concept of false memories. What we see here is not real. And how could it be? To create an even deeper sense of distortion in the memories I employ glitch aesthetics. Each image gets infused with a memory of the place it represents. Through collaboration with ChatGPT I was able to create a tool in Python, called \"Memory Infuser\", that creates a glitch like effect in a JPG, based on a text input. It is important to note that the tool is set up in a way that only creates one specific output based on the text-image combination. If the text changes, the image changes. This is a collection of my false and distorted memories of Saigon in a roughly chronological order.",
  },
  b: {
    title: "The Lottery of Forgotten Dreams",
    text:
      "The Lottery of Forgotten Dreams explores how to connect to and re-explore a place that one feels almost too familiar with after having lived there for nearly 2 decades? Sometimes the seemingly familiar is the most difficult to explore as it seems hidden in plain sight. In my project The Lottery of Forgotten Dreams – Topographies of the Unseen I re-connect to Saigon, my home for most of my adult life by using methods of conceptual and algorithmic art, as well as local customs and knowledge. It all starts with a number. Numerology is deeply embedded in Vietnamese society and beliefs. Lottery is a government sanctioned way of gambling and the tickets are sold at almost every corner of the city. There is however a second game that can be played on top of the regular lottery. It is called số đề and it has its roots in ancient mythologies. The last two numbers of each ticket represent legendary creatures (repeated after 40) and those who win the game not only can earn earthly fortunes but also have proven strong connections to the spiritual world. For this project I use the 6 figure numbers of the lottery ticket as a starting point to engage with the city. A small Python script takes as input a photograph of a lottery ticket and creates as output a random coordinate within the vicinity of Saigon. It is important to note that the same number will always create the same coordinate. I visited 100 places where the numbers lead me. The given coordinate, the place corresponding with the lottery ticket, then is the place that needs to be photographed. The Lottery of Forgotten Dreams – Topographies of the Unseen is a game. As with every game the rules can be rewritten, and many different versions can be created. Once the place has been visited the image gets combined with an AI generated image of the legendary creature represented by the last 2 digits (I created a library of 4000 images based on Albrecht Dürer's drawings) - the images get combined through an algorithm in Processing (a Java-based programming language), pixelated, rotated in 3 dimensional space (all of this including colors used are based on the 6 digit ticket number) - the results are abstract intriguing digital images that show the overlap of the real and the spiritual world.",
  },
  c: {
    title: "Go East, Young Man",
    text:
      "Go East, Young Man is an overarching video essay that connects the whole exhibition and explores the complex entanglements of personal biography, visual narrative tropes about Southeast Asia, migration, history and culture of a place, traditional and expanded photography, artificial intelligence, glitch art, conceptual art and creative coding in my artistic practice. The video essay with its AI generated footage works as meta-analytic space not only to weave the previous projects together into a cohesive narrative but also critiques AI generated imagery biases and visual tropes through autobiographical storytelling. The essay therefore functions as a new form of expanded photographic practice that makes the practice research itself visible.",
  },
  // The Zone B triptych sub-zone (three stacked Ticket 485496 images).
  d: {
    title: "Ticket 485496",
    text:
      "This triptych shows the different artifacts that led to the creation of Ticket 485496 of The Lottery of Forgotten Dreams.",
  },
};
