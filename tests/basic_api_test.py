import requests
import asyncio
import threading
import time
import random
import statistics
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from functools import wraps


# =========================
# Utility / Infrastructure
# =========================


class SimpleCache:
    def __init__(self):
        self._store: Dict[str, Any] = {}
        self._timestamps: Dict[str, float] = {}
        self._ttl = 300

    def get(self, key: str):
        if key in self._store:
            if time.time() - self._timestamps[key] < self._ttl:
                return self._store[key]
            else:
                self._store.pop(key, None)
                self._timestamps.pop(key, None)
        return None

    def set(self, key: str, value: Any):
        self._store[key] = value
        self._timestamps[key] = time.time()


cache = SimpleCache()


def cached(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        key = f"{func.__name__}:{args}:{kwargs}"
        cached_value = cache.get(key)
        if cached_value is not None:
            return cached_value
        result = func(*args, **kwargs)
        cache.set(key, result)
        return result
    return wrapper


class BaseAPIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def _get(self, endpoint: str = "", params: Dict[str, Any] = None):
        url = f"{self.base_url}{endpoint}"
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()


# =========================
# API Clients
# =========================

class JSONPlaceholderClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://jsonplaceholder.typicode.com")

    @cached
    def get_users(self):
        return self._get("/users")

    @cached
    def get_posts(self):
        return self._get("/posts")


class AgifyClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://api.agify.io")

    @cached
    def predict_age(self, name: str):
        return self._get("", params={"name": name})


class GenderizeClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://api.genderize.io")

    @cached
    def predict_gender(self, name: str):
        return self._get("", params={"name": name})


class OpenMeteoClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://api.open-meteo.com/v1/forecast")

    @cached
    def get_weather(self, latitude: float, longitude: float):
        params = {"latitude": latitude, "longitude": longitude, "current_weather": True}
        return self._get("", params=params)


class DogAPIClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://dog.ceo/api")

    @cached
    def random_dog(self):
        return self._get("/breeds/image/random")


class JokeAPIClient(BaseAPIClient):
    def __init__(self):
        super().__init__("https://official-joke-api.appspot.com")

    @cached
    def random_joke(self):
        return self._get("/random_joke")


# =========================
# Domain Models
# =========================

@dataclass
class UserProfile:
    id: int
    name: str
    username: str
    email: str
    city: str
    latitude: float
    longitude: float
    predicted_age: Optional[int] = None
    predicted_gender: Optional[str] = None
    weather: Dict[str, Any] = field(default_factory=dict)
    post_count: int = 0
    random_dog_image: Optional[str] = None
    joke: Optional[str] = None


# =========================
# Aggregation Layer
# =========================

class DataAggregator:
    def __init__(self):
        self.users_client = JSONPlaceholderClient()
        self.agify = AgifyClient()
        self.genderize = GenderizeClient()
        self.weather = OpenMeteoClient()
        self.dog = DogAPIClient()
        self.joke = JokeAPIClient()
        self.executor = ThreadPoolExecutor(max_workers=10)

    def build_profiles(self) -> List[UserProfile]:
        users = self.users_client.get_users()
        posts = self.users_client.get_posts()

        profiles: List[UserProfile] = []

        post_map = {}
        for post in posts:
            post_map.setdefault(post["userId"], []).append(post)

        for user in users:
            geo = user["address"]["geo"]
            profile = UserProfile(
                id=user["id"],
                name=user["name"],
                username=user["username"],
                email=user["email"],
                city=user["address"]["city"],
                latitude=float(geo["lat"]),
                longitude=float(geo["lng"]),
                post_count=len(post_map.get(user["id"], []))
            )
            profiles.append(profile)

        self._enrich_profiles_parallel(profiles)

        return profiles

    def _enrich_profiles_parallel(self, profiles: List[UserProfile]):
        futures = []
        for profile in profiles:
            futures.append(self.executor.submit(self._enrich_profile, profile))
        for future in futures:
            future.result()

    def _enrich_profile(self, profile: UserProfile):
        try:
            first_name = profile.name.split()[0]

            age_data = self.agify.predict_age(first_name)
            gender_data = self.genderize.predict_gender(first_name)
            weather_data = self.weather.get_weather(profile.latitude, profile.longitude)
            dog_data = self.dog.random_dog()
            joke_data = self.joke.random_joke()

            profile.predicted_age = age_data.get("age")
            profile.predicted_gender = gender_data.get("gender")
            profile.weather = weather_data.get("current_weather", {})
            profile.random_dog_image = dog_data.get("message")
            profile.joke = f"{joke_data.get('setup')} - {joke_data.get('punchline')}"

        except Exception as e:
            print(f"Error enriching profile {profile.id}: {e}")


# =========================
# Analytics Layer
# =========================

class AnalyticsEngine:
    def __init__(self, profiles: List[UserProfile]):
        self.profiles = profiles

    def average_age(self):
        ages = [p.predicted_age for p in self.profiles if p.predicted_age]
        return statistics.mean(ages) if ages else None

    def gender_distribution(self):
        distribution = {}
        for p in self.profiles:
            if p.predicted_gender:
                distribution[p.predicted_gender] = distribution.get(p.predicted_gender, 0) + 1
        return distribution

    def average_post_count(self):
        counts = [p.post_count for p in self.profiles]
        return statistics.mean(counts) if counts else 0

    def temperature_stats(self):
        temps = [p.weather.get("temperature") for p in self.profiles if p.weather]
        temps = [t for t in temps if t is not None]
        if not temps:
            return {}
        return {"min": min(temps), "max": max(temps), "avg": statistics.mean(temps)}

    def summary(self):
        return {"average_age": self.average_age(), "gender_distribution": self.gender_distribution(), "average_post_count": self.average_post_count(), "temperature_stats": self.temperature_stats()}


# =========================
# Async Layer (Extra Complexity)
# =========================

#class AsyncSampler:
#    def __init__(self, aggregator: DataAggregator):
#        self.aggregator = aggregator
#
#    async def periodic_sample(self, interval: int = 5, cycles: int = 2):
#        for i in range(cycles):
#            print(f"\n[Async Sample Cycle {i + 1}]")
#            profiles = self.aggregator.build_profiles()
#            analytics = AnalyticsEngine(profiles)
#            print("Summary:", analytics.summary())
#            await asyncio.sleep(interval)


# =========================
# Reporting Layer
# =========================

class ReportBuilder:
    def __init__(self, profiles: List[UserProfile]):
        self.profiles = profiles

    def build_text_report(self) -> str:
        lines = []
        lines.append("=== USER DATA AGGREGATION REPORT ===\n")

        for p in self.profiles:
            lines.append(f"User: {p.name} ({p.username})")
            lines.append(f"  Email: {p.email}")
            lines.append(f"  City: {p.city}")
            lines.append(f"  Posts: {p.post_count}")
            lines.append(f"  Predicted Age: {p.predicted_age}")
            lines.append(f"  Predicted Gender: {p.predicted_gender}")
            lines.append(f"  Weather: {p.weather}")
            lines.append(f"  Random Dog: {p.random_dog_image}")
            lines.append(f"  Joke: {p.joke}")
            lines.append("-" * 50)

        return "\n".join(lines)


# =========================
# Orchestration
# =========================

class Application:
    def __init__(self):
        self.aggregator = DataAggregator()

    def run(self):
        print("Building user profiles...\n")
        profiles = self.aggregator.build_profiles()

        analytics = AnalyticsEngine(profiles)
        report = ReportBuilder(profiles)

        print(report.build_text_report())
        print("\n=== ANALYTICS SUMMARY ===")
        print(analytics.summary())

        print("\nStarting async sampler...\n")
        asyncio.run(self._run_async())

    #async def _run_async(self):
        #sampler = AsyncSampler(self.aggregator)
        #await sampler.periodic_sample(interval=3, cycles=2)


# =========================
# Entry Point
# =========================

def main():
    app = Application()
    app.run()


if __name__ == "__main__":
    main()
