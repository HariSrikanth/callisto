import { QueryService } from "@/services/query-service";

async function main() {
  const queryService = QueryService.getInstance();
  
  try {
    // Example 1: Simple query
    const weatherResponse = await queryService.makeQuery("What's the weather like today?");
    console.log('Weather Response:', weatherResponse);

    // Example 2: Using Exa web search
    const searchResponse = await queryService.makeQuery("Search the web for latest AI developments");
    console.log('Search Response:', searchResponse);

    // Example 3: Company research
    const companyResponse = await queryService.makeQuery("Research company: OpenAI");
    console.log('Company Research Response:', companyResponse);

  } catch (error) {
    console.error('Error occurred:', error);
  } finally {
    // Always cleanup when done
    await queryService.cleanup();
  }
}

main().catch(console.error); 